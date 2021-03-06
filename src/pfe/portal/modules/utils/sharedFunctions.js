/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
// Functions that can be used anywhere in the codebase
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/Logger');
const log = new Logger('sharedFunctions.js');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// This if statement allows us to only include one utils function, exporting either
//      the Docker of K8s one depending on which environment we're in
const containerFunctions = require((global.codewind && global.codewind.RUNNING_IN_K8S ? './kubernetesFunctions' : './dockerFunctions'));

// variable to do a async timeout
const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Function check if a file exists (is accessable)
 * Essentially an async version of fs.exists
 * @param file, the file
 * @return true if file is accessable, false if not
 */
async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Function to make a HTTP request using a promise instead of callback
 * @param options, the HTTP request options
 * @param body, the HTTP request body (optional)
 * @param secure, true for https requests, false for http requests (optional, default is http)
 * @return res, the response from the HTTP request
 */

function asyncHttpRequest(options, body, secure = false) {
  return new Promise(function (resolve, reject) {
    let protocol = secure ? https : http;
    let req = protocol.request(options, function(res) {
      res.body = '';
      // Listen for response events.
      res.on('error', function(err) {
        return reject(err);
      });
      res.on('data', function (data) {
        res.body += data
      });
      res.on('end', function() {
        return resolve(res);
      });
    });

    // Listen for request events.
    req.on('error', function(err) {
      return reject(err);
    });
    req.setTimeout(30 * 1000);
    req.on('timeout', function() {
      // Calling abort will trigger an error which will call
      // reject above.
      req.abort();
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Function which takes two Javascript Objects and updates the first
 *  with the fields in the second
 * @param objectToUpdate, an object which should be updated with the new fields/values
 * @param fieldsToAddToObject, an object which contains fields/values to add to the object
 * @return the updated object
 */
function updateObject(objectToUpdate, fieldsToAddToObject) {
  for (let key in fieldsToAddToObject) {
    objectToUpdate[key] = fieldsToAddToObject[key];
  }
  return objectToUpdate;
}

async function copyProject(fromProjectPath, toProjectPath, mode) {
  log.debug(`copyProject fromPath: ${fromProjectPath}, toPath: ${toProjectPath}`);
  await fs.copy(fromProjectPath, toProjectPath, { preserveTimestamps: true });
  if (mode) {
    await fs.chmod(toProjectPath, mode);
  }
}

/**
 * Force remove a path, regardless of whether it exists, or it's file or directory that may or may not be empty.
 * Better than fs-extra fs.remove as it won't recurse down each directory tree and take over the event loop
 *
 * @param {string} path, path to remove
 */
async function forceRemove(path) {
  try {
    await exec(`rm -rf "${path}"`);
  }
  catch (err) {
    log.warn(err.message);
  }
}

/** C:\helloThere -> /c/helloThere */
function convertFromWindowsDriveLetter(windowsPath) {
  if (!isWindowsAbsolutePath(windowsPath)) {
    return windowsPath;
  }
  let linuxPath = convertBackSlashesToForwardSlashes(windowsPath);
  const char0 = linuxPath.charAt(0);
  linuxPath = linuxPath.substring(2);
  linuxPath = "/" + char0.toLowerCase() + linuxPath;
  return linuxPath;
}

function convertBackSlashesToForwardSlashes(str) {
  return str.split("\\").join("/");
}

function isWindowsAbsolutePath(absolutePath) {
  if (absolutePath.length < 2) {
    return false;
  }
  const char0 = absolutePath.charAt(0);
  if (!isLetter(char0)) {
    return false;
  }
  if (absolutePath.charAt(1) !== ":") {
    return false;
  }
  return true;
}

function isLetter(currentChar) {
  return ("a" <= currentChar && currentChar <= "z")
      || ("A" <= currentChar && currentChar <= "Z");
}

function getProjectSourceRoot(project) {
  let projectRoot = "";
  switch (project.projectType) {
  case 'nodejs': {
    projectRoot = "/app";
    break
  }
  case 'liberty': {
    projectRoot = "/home/default/app";
    break
  }
  case 'swift': {
    projectRoot = "/swift-project";
    break
  }
  case 'spring': {
    projectRoot = "/root/app";
    break
  }
  case 'docker': {
    projectRoot = "/code";
    break
  }
  default: {
    projectRoot = "/";
    break
  }
  }
  return projectRoot;
}

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

// List all the files or directories under a given directory
// getDirectories: true will return directories, false will return files
async function recursivelyListFilesOrDirectories(getDirectories, absolutePath, relativePath = '') {
  const directoryContents = await fs.readdir(absolutePath);
  const completePathArray = await Promise.all(directoryContents.map(async dir => {
    const pathList = [];
    const nextRelativePath = path.join(relativePath, dir);
    const nextAbsolutePath = path.join(absolutePath, dir);
    const stats = await fs.stat(nextAbsolutePath);
    if (stats.isDirectory()) {
      const subDirectories = await recursivelyListFilesOrDirectories(getDirectories, nextAbsolutePath, nextRelativePath);
      if (getDirectories) pathList.push(nextRelativePath);
      pathList.push(...subDirectories);
    } else if (!getDirectories) {
      pathList.push(nextRelativePath);
    }
    return pathList;
  }))
  return completePathArray.reduce((a, b) => a.concat(b), []);
}

// Returns the first file that matches the fileName
async function findFile(fileName, directory) {
  const currentFileList = await recursivelyListFilesOrDirectories(false, directory);
  const foundFilePath = currentFileList.find(filePath => path.basename(filePath) === fileName);
  if (foundFilePath) {
    return path.join(directory, foundFilePath);
  }
  return null;
}

module.exports = {
  ...containerFunctions,
  timeout,
  fileExists,
  asyncHttpRequest,
  updateObject,
  copyProject,
  forceRemove,
  convertFromWindowsDriveLetter,
  isWindowsAbsolutePath,
  getProjectSourceRoot,
  deepClone,
  recursivelyListFilesOrDirectories,
  findFile,
}
