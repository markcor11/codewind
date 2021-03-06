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
'use strict';

// dotenv reads .env and adds it to the process.env object
require('dotenv').config()

const express = require('express');
require('express-async-errors');
const bodyParser = require('body-parser');
const childProcess = require('child_process');
const Io = require('socket.io');
const path = require('path');
const { inspect } = require('util');

const monitor = require('./monitor/route');
const Logger = require('./utils/Logger');

const log = new Logger(__filename);

const app = express();
const serverPort = 9095;
const server = app.listen(serverPort, () => log.info(`Performance server listening on port ${serverPort}!`))
const io = Io.listen(server);

var loadProcess = {};

const codewindVersion = process.env.CODEWIND_VERSION;
const imageBuildTime = process.env.IMAGE_BUILD_TIME


app.use(bodyParser.json());
log.logAllApiCalls(app); // must be called after 'app.use(bodyParser)', and before 'app.use(router)'
app.get('/', (req, res) => res.send('Performance Container is running...'));

app.get('/health', (req, res) => res.json({ status: 'UP' }));


app.get('/performance/api/v1/environment', (req, res) => {
    const environment = {
        codewind_version: codewindVersion,
        image_build_time: imageBuildTime
    }
    res.end(JSON.stringify(environment, null, 2));
});

/**
* API Function to start a load run
* @param req, the http request containing the project parameters
* @return {res.code} 202 for accepted, 400 if options are invalid or a run
* is already in progress, 500 if error
*/
app.post('/api/v1/runload', async function (req, res) {
    try {
        if (!loadProcess[req.body.projectID]) {
            if (!req.body.url) {
                log.error('URL is required');
                res.sendStatus(500);
                return;
            }
            runLoad(req.body);
            res.sendStatus(202);
        } else {
            log.error('A load run is already in progress');
            res.status(409).send("A load run is already in progress");
            return;
        }
    } catch (err) {
        res.status(500).send(err);
        log.error(err);
    }
});

/**
* API Function to cancel a load run
* @param req, the http request containing the project parameters
* @return {res.code} 200 on success, 400 if wrong project or no load
* being run on that given project, 500 if error
*/
app.post('/api/v1/cancelLoad', async function (req, res) {
    try {
        if (loadProcess[req.body.projectID]) {
            loadProcess[req.body.projectID].kill('SIGKILL');
            res.sendStatus(200);
            return;
        } else {
            log.error('No run in progress');
            res.status(409).send("No run in progress");
        }
    } catch (err) {
        res.status(500).send(err);
        log.error(err);
    }
});

function runLoad(options) {
    log.info(`starting loadrun with options : ${JSON.stringify(options)}`);
    io.emit('starting', {projectID: options.projectID});
    var output = "";
    var errOutput = "";
    loadProcess[options.projectID] = childProcess.spawn('node', ['runload.js', JSON.stringify(options)], { stdio: 'pipe' });
    io.emit('started', {projectID: options.projectID});
    loadProcess[options.projectID].stdout.on('data', (data) => {
        output = output + data;
    });
    loadProcess[options.projectID].stderr.on('data', (data) => {
        errOutput = errOutput + data;
    });
    loadProcess[options.projectID].on('exit', (code, signal) => {
        loadProcess[options.projectID] = null;
        // Log any stray codes thrown back from the kill process signal
        log.debug(`signal: ${signal}`);
        log.debug(`code: ${code}`);
        if (signal === 9 || signal === 'SIGKILL') { // cancelled
            log.info('cancelled');
            io.emit('cancelled', {projectID: options.projectID});
        } else if (code != 0) { // error
            log.error(`error ${errOutput}`);
            io.emit('loadrunError', {output: output, error: errOutput, projectID: options.projectID});
        } else { // success
            log.info(`completed - loadrun summary : ${output}`);
            io.emit('completed', {output: output, projectID: options.projectID});
        }
    }).on('error', (err) => {
        loadProcess[options.projectID] = null;
        io.emit('loadrunError', {output: output, error: errOutput, projectID: options.projectID});
        log.error(err);
    });
    log.debug(`loadProcess = ${inspect(loadProcess[options.projectID])}`);
}

/** React Performance Dashboard static files */
app.use('/performance/static', express.static(path.join(__dirname, 'dashboard', 'build', 'static')));

/** React Performance Dashboard styles files */
app.use('/performance/styles', express.static(path.join(__dirname, 'dashboard', 'build', 'styles')));

/** Carbon Plex Fonts */
app.use('/performance/fonts', express.static(path.join(__dirname, 'dashboard', 'build', 'fonts')));

/** React Performance main.js */
app.use('/performance/main.js', express.static(path.join(__dirname, 'dashboard', 'build', 'main.js')));

app.use('/performance/monitor', monitor);

/**
* Map everything else in the /dashboard/ directory to the
* React Single-Page-Application root index.html
*/
app.get('/performance/*', function (req, res) {
    res.sendFile(path.join(__dirname, 'dashboard', 'build', 'index.html'));
});
