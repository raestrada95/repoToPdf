# Use a Node.js base image
FROM node:14-slim

# Switch to root temporarily to install dependencies
USER root

# Update and install necessary dependencies, including Git, wkhtmltopdf, and pdftk
RUN apt-get update && apt-get install -y \
    wkhtmltopdf \
    git \
    pdftk \
    && rm -rf /var/lib/apt/lists/*

# Create the directory for XDG_RUNTIME_DIR
RUN mkdir -p /tmp/runtime-user

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if it exists)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Define environment variables 
ENV REPO_URL=""
ENV XDG_RUNTIME_DIR=/tmp/runtime-user 

# Add npm's binary directory to PATH
ENV PATH="/usr/src/app/node_modules/.bin:${PATH}"

# Verify installations and environment
RUN echo "wkhtmltopdf version:" && wkhtmltopdf --version \
    && echo "Node version:" && node --version \
    && echo "NPM version:" && npm --version \
    && echo "Git version:" && git --version \
    && echo "PATH:" && echo $PATH \
    && echo "XDG_RUNTIME_DIR:" && echo $XDG_RUNTIME_DIR 

# Ensure correct permissions
RUN chmod -R 755 /usr/src/app

# Command to run the application
CMD ["node", "main.js", "--"]