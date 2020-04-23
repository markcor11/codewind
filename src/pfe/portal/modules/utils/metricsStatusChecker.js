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

const fs = require('fs-extra');
const path = require('path');

const { asyncHttpRequest } = require('./sharedFunctions');
const MetricsStatusError = require('../utils/errors/MetricsStatusError')
const Logger = require('../utils/Logger');
const log = new Logger('metricsStatusChecker.js');

const filesToCheck = {
  java : 'pom.xml',
  nodejs : 'package.json',
  javascript : 'package.json',
  swift : 'Package.swift',
}

const METRICS_DASH_HOST = {
  project: 'project',
  performanceContainer: 'performanceContainer',
};

const VALID_METRIC_ENDPOINT = {
  metrics: {
    endpoint: '/metrics',
    hosting: METRICS_DASH_HOST.performanceContainer,
  },
  appmetricsDash: {
    endpoint: '/appmetrics-dash',
    hosting: METRICS_DASH_HOST.project,
  },
  javametricsDash: {
    endpoint: '/javametrics-dash',
    hosting: METRICS_DASH_HOST.project,
  },
  swiftmetricsDash: {
    endpoint: '/swiftmetrics-dash',
    hosting: METRICS_DASH_HOST.project,
  },
  actuatorPrometheus: {
    endpoint: '/actuator/prometheus', // Spring Appsody applications
    hosting: METRICS_DASH_HOST.performanceContainer,
  }
}

async function getMetricStatusForProject(project) {
  const { language, host, ports: { internalPort }, appStatus } = project;
  const projectPath = project.projectPath();

  const running = appStatus === 'started';

  // file system checks
  const appmetricsPackage = await isAppmetricsInFileSystem(projectPath, language);
  // const microprofilePackage = await 

  // endpoints checks
  const metricEndpoints = await getActiveMetricsURLs(host, internalPort);
  const metricsEndpoint = metricEndpoints[VALID_METRIC_ENDPOINT.metrics.endpoint];
  const appmetricsEndpoint = metricEndpoints[VALID_METRIC_ENDPOINT.appmetricsDash.endpoint] ||
                              metricEndpoints[VALID_METRIC_ENDPOINT.javametricsDash.endpoint] ||
                              metricEndpoints[VALID_METRIC_ENDPOINT.swiftmetricsDash.endpoint];
  const metricsAvailable = true && (metricsEndpoint || appmetricsEndpoint)

  return {
    metricsAvailable,
    running,
    metricsEndpoint,
    appmetricsEndpoint,
    microprofilePackage: true,
    appmetricsPackage,
    performanceEnable: true
  }
}

/**
 * @param {*} projectPath
 * @param {*} projectLanguage
 * @returns {Promise<Boolean>} The projects supports metrics,
 * based on the values of its build-file.
 */
async function isAppmetricsInFileSystem(projectPath, projectLanguage) {
  log.debug(`checking if metricsAvailable for ${projectLanguage} project`);
  const fileToCheck = filesToCheck[projectLanguage];
  if (!fileToCheck) {
    return false; // not a language with supported metrics
  }
  const pathOfFileToCheck = path.join(projectPath, fileToCheck);
  if (await fs.pathExists(pathOfFileToCheck)) {
    return doesMetricsPackageExist(pathOfFileToCheck, projectLanguage)
  }
  throw new MetricsStatusError('BUILD_FILE_MISSING', `Cannot find project build-file (${fileToCheck})`);
}

async function doesMetricsPackageExist(pathOfFileToCheck, projectLanguage) {
  let metricsPackageExists = false; // default to appmetrics unavailable
  try {
    const fileToCheck = await fs.readFile(pathOfFileToCheck, 'utf8');
    if (projectLanguage === 'nodejs' || projectLanguage === 'javascript') {
      const packageJSON = JSON.parse(fileToCheck);
      // There might not be any dependencies
      if (packageJSON.dependencies) {
        if (packageJSON.dependencies['appmetrics-dash']) {
          metricsPackageExists = true;
        }
      }
    } else if (projectLanguage === 'java') {
      metricsPackageExists = fileToCheck.includes('javametrics');
    } else if (projectLanguage === 'swift') {
      metricsPackageExists = fileToCheck.includes('SwiftMetrics.git');
    }
  } catch(err) {
    // If we failed to read the file / parse json return false
  }
  log.debug(`doesMetricsPackageExist returning ${metricsPackageExists}`);
  return metricsPackageExists;
}

async function hasMicroprofileMetrics(filePath) {
  const pomExists = await fs.pathExists(filePath);
  if (!pomExists) return false;
  const openLibertyString = '<artifactId>microprofile</artifactId>';
  const contents = await fs.readFile(filePath, 'utf8');
  return contents.includes(openLibertyString);
}

async function getMetricsDashboardHostAndPath(host, port, projectID, projectLanguage) {
  const endpoints = await getActiveMetricsURLs(host, port);
  const prioritisedReturnOrder = [
    VALID_METRIC_ENDPOINT.metrics, // enabled but only for Java while performance dashboard is enhanced to support more /metrics endpoints
    // VALID_METRIC_ENDPOINT.actuatorPrometheus, not supported in the performance dashboard
    VALID_METRIC_ENDPOINT.appmetricsDash,
    VALID_METRIC_ENDPOINT.javametricsDash,
    VALID_METRIC_ENDPOINT.swiftmetricsDash,
  ];

  const dashboardObject = prioritisedReturnOrder.find(({ endpoint }) => {
    // For Java use /metrics if possible, fall back to javametrics-dash
    // For Node, force appmetrics-dash while performance dashboard is enhanced to support more /metrics endpoints
    // Everything else should use *metrics-dash as we can't guarantee we support /metrics for anything
    if (endpoint === VALID_METRIC_ENDPOINT.metrics.endpoint && projectLanguage !== 'java') {
      return false;
    }
    return endpoints[endpoint] === true;
  });

  // If no metric endpoints are active, return null
  if (!dashboardObject) {
    return {
      hosting: null,
      path: null,
    }
  }

  const { hosting, endpoint } = dashboardObject;
  const path = getDashboardPath(hosting, endpoint, projectID, projectLanguage);
  return {
    hosting,
    path,
  };
}

async function getActiveMetricsURLs(host, port) {
  const endpointsToCheck = Object.keys(VALID_METRIC_ENDPOINT).map((name) => VALID_METRIC_ENDPOINT[name].endpoint);
  const endpoints = await Promise.all(endpointsToCheck.map(async (endpoint) => {
    const isActive = await isMetricsEndpoint(host, port, endpoint);
    return { endpoint, isActive };
  }));

  return endpoints.reduce((acc, { endpoint, isActive }) => {
    acc[endpoint] = isActive;
    return acc;
  }, {});
}

function getDashboardPath(metricsDashHost, projectMetricEndpoint, projectID, language) {
  if (metricsDashHost === METRICS_DASH_HOST.project) {
    return `${projectMetricEndpoint}/?theme=dark`;
  }

  // Currently we only support java and nodejs on the performance dashboard
  if (['java', 'nodejs'].includes(language) && metricsDashHost === METRICS_DASH_HOST.performanceContainer) {
    return `/performance/monitor/dashboard/${language}?theme=dark&projectID=${projectID}`
  }

  return null;
}

async function isMetricsEndpoint(host, port, path) {
  const options = {
    host,
    port,
    path,
    method: 'GET',
  }

  let res;
  try {
    res = await asyncHttpRequest(options);
  } catch(err) {
    // If the request errors then the metrics endpoint isn't available
    return false;
  }
  const { statusCode, body } = res;
  const validRes = (statusCode === 200);
  if (!validRes || !body) {
    return false;
  }

  const isAppmetrics = isAppmetricsFormat(body);
  const isPrometheus = isPrometheusFormat(body);
  return (isAppmetrics || isPrometheus);
}

function isAppmetricsFormat(html) {
  return html.includes('src="graphmetrics/js');
}

function isPrometheusFormat(string) {
  // Split string by new lines
  const lines = string.split('\n');
  // If the final line is empty, remove it
  if (lines[lines.length-1] === "") lines.pop();
  // Ensure number of spaces on each line is 1 (ignoring comment lines)
  const { length: numberOfValidPrometheusLines } = lines.filter(line => {
    // Ignore lines beginning with # as they are comments
    const lineIsComment = line.startsWith('#');
    // Valid prometheus metrics are in the format "name metric"
    // e.g. api_http_requests_total{method="POST", handler="/messages"} value
    // Remove everything between "{}" and the brackets themselves
    const validatedLine = line.replace(/{.*}/, '');
    // Ensure there is only one space between the metric name and value
    const validMetric = (validatedLine.split(" ").length-1) === 1;
    return lineIsComment || validMetric;
  });
  return lines.length === numberOfValidPrometheusLines;
}

module.exports = {
  getMetricStatusForProject,
  isMetricsAvailable: isAppmetricsInFileSystem,
  getActiveMetricsURLs,
  getMetricsDashboardHostAndPath,
}
