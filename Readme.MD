# RepoToPdf

RepoToPdf is a Node.js application that converts GitHub repository documentation to PDF format. It clones a specified repository, searches for Markdown files in the documentation folders, converts them to PDF, and then merges all PDFs into a single document.

## Features

- Clone GitHub repositories
- Automatically detect documentation folders
- Convert Markdown files to PDF
- Merge multiple PDFs into a single document
- Parallel processing for faster conversion
- Customizable output directory
- Option to clean up temporary files after conversion
- Support for known repository structures
- Recursive search for documentation folders

## Prerequisites

- Node.js (v14 or later recommended)
- Git
- wkhtmltopdf
- pdftk

## Installation

1. Clone this repository:
git clone https://github.com/raestrada95/RepoToPdf.git


2. Navigate to the project directory:
cd RepoToPdf


3. Install dependencies:
npm install


## Usage

Run the application using the following command:

npm start -- [options]


### Options:

- `-u, --url <url>`: GitHub repository URL (required)
- `-o, --output <directory>`: Output directory for PDFs (default: './output')
- `-c, --clean`: Remove temporary files and downloaded directories after conversion (default: true)
- `-p, --parallel <number>`: Number of parallel operations (default: 5)
- `-r, --recursive`: Search recursively for docs folders (default: false)
- `-d, --docs-path <path>`: Custom path to docs folder within the repository

### Example:

npm start -- -u https://github.com/reactjs/react -o ./react-docs -p 10


This command will clone the React repository, convert its documentation to PDF, and save the output in the `./react-docs` directory, using 10 parallel operations.

## Docker

A Dockerfile is provided for containerized usage. To build and run the Docker image:

1. Build the image:
docker build -t repotopdf .


2. Run the container:
docker run -v $(pwd)/output:/usr/src/app/output repotopdf -u https://github.com/reactjs/react


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.
This README.md provides an overview of the project, its features, installation instructions, usage examples, and information about Docker usage. You may want to adjust some details, such as the repository URL, based on your specific project setup.