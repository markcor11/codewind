/*******************************************************************************
* Copyright (c) 2020 IBM Corporation and others.
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the Eclipse Public License v2.0
* which accompanies this distribution, and is available at
* http://www.eclipse.org/legal/epl-v20.html
*
* Contributors:
*     IBM Corporation - initial API and implementation
******************************************************************************/

export const STATUS_OK = 1;
export const STATUS_ERROR = -1;
export const STATUS_WARNING = 0;

export const MESSAGE_PROJECT_RUNNING = 'Your project has started and is running.';
export const MESSAGE_PROJECT_NOT_RUNNING = 'Your project is not responding. From your IDE, open project settings then build and start your project.';
export const MESSAGE_PROJECT_NOT_COMPATIBLE = 'Your project is not compatible with this feature';
export const MESSAGE_LOADRUNNER_AVAILABLE = 'Load pressure can be applied to your project.';
export const MESSAGE_LOADRUNNER_NOT_AVAILABLE = 'Your project is not running. Load pressure can only be applied to running projects.';
export const MESSAGE_LIVEMETRICS_AVAILABLE = 'Live metrics are available for your project';
export const MESSAGE_LIVEMETRICS_MICROPROFILE = 'Your project has all the prerequisite modules installed but the feature it is not currently available. Likely cause: MicroProfile is authenticated';
export const MESSAGE_LIVEMETRICS_INJECT = 'Action required: Open the project settings in your IDE and enable the Inject AppMetrics checkbox';
export const MESSAGE_COMPARISONS_AVAILABLE = 'Your project does support load test result comparisons';
export const MESSAGE_COMPARISONS_INJECT = 'Action required: Open the project settings in your IDE and enable the Inject AppMetrics checkbox';
export const MESSAGE_COMPARISONS_NOT_RUNNING = 'Your project is not running. Running new load tests will not be available however you can view past results.';
