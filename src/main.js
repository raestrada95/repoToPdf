const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const util = require('util');
const execAsync = util.promisify(exec);
const process = require('process');

// Aumentar el máximo de listeners permitidos
require('events').EventEmitter.defaultMaxListeners = 50;

(async () => {
  const pLimit = (await import('p-limit')).default;

  const knownRepos = {
    'sveltejs/svelte': './documentation/docs',
    'reactjs/react': './docs',
    'vuejs/vue': './docs',
    'angular/angular': './aio/content',
  };

  program
    .option('-u, --url <url>', 'GitHub repository URL')
    .option('-o, --output <directory>', 'Output directory for PDFs', './output')
    .option('-c, --clean', 'Remove temporary files and downloaded directories after conversion', true)
    .option('-p, --parallel <number>', 'Number of parallel operations', '5')
    .option('-r, --recursive', 'Search recursively for docs folders', false)
    .option('-d, --docs-path <path>', 'Custom path to docs folder within the repository')
    .parse(process.argv);

  const options = program.opts();

  if (!options.url) {
    console.error('Please provide a GitHub URL using the -u or --url option');
    process.exit(1);
  }

  const repoUrl = options.url;
  const outputDir = options.output;
  const cleanAfterConversion = options.clean;
  const parallelOperations = parseInt(options.parallel, 10);
  const searchRecursively = options.recursive;
  const customDocsPath = options.docsPath;

  function getRepoName(url) {
    const parts = url.split('/');
    return `${parts[parts.length - 2]}/${parts[parts.length - 1].replace('.git', '')}`;
  }

  function getMergedFilename(repoName) {
    return `${repoName.replace('/', '_')}_docs.pdf`;
  }

  async function cloneRepo(url) {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'repo-'));
    console.log(`Cloning repository to ${tempDir}...`);
    await execAsync(`git clone ${url} ${tempDir}`);
    return tempDir;
  }

  async function findDocsFolders(dir, knownPath, docsFolders = []) {
    if (knownPath) {
      const fullPath = path.join(dir, knownPath);
      if (await fs.stat(fullPath).then(stat => stat.isDirectory()).catch(() => false)) {
        docsFolders.push(fullPath);
        return docsFolders;
      }
    }

    if (customDocsPath) {
      const fullPath = path.join(dir, customDocsPath);
      if (await fs.stat(fullPath).then(stat => stat.isDirectory()).catch(() => false)) {
        docsFolders.push(fullPath);
        return docsFolders;
      }
    }

    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        const fullPath = path.join(dir, item.name);
        if (item.name === 'docs') {
          docsFolders.push(fullPath);
          if (!searchRecursively) break;
        }
        if (searchRecursively) {
          await findDocsFolders(fullPath, null, docsFolders);
        }
      }
    }
    return docsFolders;
  }
  
  async function convertToPdf(mdFile, outputFile) {
    console.log(`Converting ${mdFile} to PDF...`);
    try {
      // Usando wkhtmltopdf para convertir desde archivo Markdown
      const command = `wkhtmltopdf '${mdFile}' '${outputFile}'`;
      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.warn(`Warning during conversion of ${mdFile}:`, stderr);
      }
      return { success: true, file: outputFile };
    } catch (error) {
      console.error(`Error converting ${mdFile}:`, error.message);
      if (error.stdout) console.error("stdout:", error.stdout);
      if (error.stderr) console.error("stderr:", error.stderr);
      return { success: false, file: mdFile, error: error.message };
    }
  }

  async function processFiles(dir, baseOutputDir, docsDir, pdfFiles, failedFiles) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    const limit = pLimit(parallelOperations);
    const conversionPromises = [];

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        const newOutputDir = path.join(baseOutputDir, item.name);
        await fs.mkdir(newOutputDir, { recursive: true });
        conversionPromises.push(limit(() => processFiles(fullPath, newOutputDir, docsDir, pdfFiles, failedFiles)));
      } else if (item.isFile() && path.extname(item.name).toLowerCase() === '.md') {
        const relativePath = path.relative(docsDir, dir);
        const outputSubDir = path.join(baseOutputDir, relativePath);
        await fs.mkdir(outputSubDir, { recursive: true });
        const pdfFile = path.join(outputSubDir, `${path.basename(item.name, '.md')}.pdf`);
        conversionPromises.push(
          limit(() => convertToPdf(fullPath, pdfFile).then(result => {
            if (result.success) {
              pdfFiles.push(result.file);
            } else {
              failedFiles.push(result);
            }
          }))
        );
      }
    }

    await Promise.all(conversionPromises);
  }

  async function mergePdfs(pdfFiles, outputFile) {
    console.log('Merging PDFs...');
    const escapedPdfFiles = pdfFiles.map(file => `'${file.replace(/'/g, "'\\\\\\\\''")}'`).join(' ');
    const escapedOutputFile = outputFile.replace(/'/g, "'\\\\\\\\''");
    const pdftkCommand = `pdftk ${escapedPdfFiles} cat output '${escapedOutputFile}' compress`;
    try {
      await execAsync(pdftkCommand);
      console.log(`PDFs merged into ${outputFile}`);
    } catch (error) {
      console.error(`Error merging PDFs: ${error.message}`);
    }
  }

  async function cleanUp(repoDir, outputDir, mergedFilename) {
    console.log('Cleaning up temporary files and downloaded directories...');
    await fs.rm(repoDir, { recursive: true, force: true });
    const items = await fs.readdir(outputDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(outputDir, item.name);
      if (item.isFile() && item.name !== mergedFilename) {
        await fs.unlink(fullPath);
      } else if (item.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      }
    }
    console.log('Cleanup completed.');
  }

  async function main() {
    let repoDir;
    let docsFolders;

    repoDir = await cloneRepo(repoUrl);
    const repoName = getRepoName(repoUrl);
    const knownPath = knownRepos[repoName];
    const mergedFilename = getMergedFilename(repoName);
    
    docsFolders = await findDocsFolders(repoDir, knownPath);

    if (docsFolders.length === 0) {
      console.error('No "docs" folders found in the repository.');
      await fs.rm(repoDir, { recursive: true, force: true });
      process.exit(1);
    }

    const repoOutputDir = path.join(outputDir, repoName.replace('/', '-'));
    await fs.mkdir(repoOutputDir, { recursive: true });

    const allPdfFiles = [];
    const allFailedFiles = [];
    await Promise.all(docsFolders.map(async (docsDir) => {
      const pdfFiles = [];
      const failedFiles = [];
      const relativeDocsPath = path.relative(repoDir, docsDir);
      const docsOutputDir = path.join(repoOutputDir, relativeDocsPath);
      await processFiles(docsDir, docsOutputDir, docsDir, pdfFiles, failedFiles);
      allPdfFiles.push(...pdfFiles);
      allFailedFiles.push(...failedFiles);
    }));

    if (allFailedFiles.length > 0) {
      console.log('The following files failed to convert:');
      allFailedFiles.forEach(file => {
        console.log(`- ${file.file}: ${file.error}`);
      });
    }

    if (allPdfFiles.length > 0) {
      const mergedPdfPath = path.join(repoOutputDir, mergedFilename);
      await mergePdfs(allPdfFiles, mergedPdfPath);
      console.log(`Conversion complete. Individual PDFs and merged document are in ${repoOutputDir}`);
    } else {
      console.log('No PDFs were successfully created.');
    }

    if (cleanAfterConversion) {
      await cleanUp(repoDir, repoOutputDir, mergedFilename);
    } else {
      await fs.rm(repoDir, { recursive: true, force: true });
    }
  }

  const exitHandler = () => {
    console.log('Process exited');
    process.off('exit', exitHandler);
  };

  process.on('exit', exitHandler);

  main().catch(console.error);

  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  signals.forEach(signal => {
    const listener = () => {
      console.log(`${signal} received`);
      process.off(signal, listener);
      process.exit(1);
    };
    process.on(signal, listener);
  });
})();