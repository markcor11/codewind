/*******************************************************************************
* Copyright (c) 2019 IBM Corporation and others.
* All rights reserved. This program and the accompanying materials
* are made available under the terms of the Eclipse Public License v2.0
* which accompanies this distribution, and is available at
* http://www.eclipse.org/legal/epl-v20.html
*
* Contributors:
*     IBM Corporation - initial API and implementation
******************************************************************************/

import React, { Fragment } from 'react';
import io from 'socket.io-client'

import { BrowserRouter as Router, Route } from 'react-router-dom';

import './index.scss';

import ErrorBoundary from './components/utils/ErrorBoundary';
import ModalNoProjectID from './components/modals/ModalNoProjectID';
import NavBar from './components/navBar/NavBar';
import PagePerformance from './pages/PagePerformance';
import SocketContext from './utils/sockets/SocketContext';
import * as ProjectIDChecker from './utils/projectUtils';
import * as AppConstants from './AppConstants';

let socketURL = `${AppConstants.API_HOST}/default`;
let socketPath = `${AppConstants.API_ROOT}/socket.io/`;

const socket = io(socketURL, {
  timeout: '10000',
  path: socketPath,
});

socket.on('connecting', function(){
  console.info('Dashboard: SocketIO connecting');
});

socket.on('reconnecting', function(){
  console.info('Dashboard: SocketIO reconnecting');
});

// Authenticate socket after connecting
socket.on('connect', function(){
  console.info('Dashboard: SocketIO connect');
  const accessToken = localStorage.getItem("cw-access-token");
  if (accessToken) {
    console.info('Dashboard: SocketIO authenticating');
    try {
      socket.emit('authentication', {  token:  accessToken });
    } catch (err) {
      console.error(`Dashboard: SocketIO authentication error - ${err}`);
    }
  }
});

socket.on('authenticated', function(message){
  console.info(`Dashboard: SocketIO authenticated: ${message}`);
});

socket.on('unauthorized', function(err){
  console.error("There was an error with the authentication:", err.message);
  alert("Authentication failed - try refreshing this page");
});

socket.on('connect_failed', function(){
  console.error('Dashboard: SocketIO connection failed');
});

socket.on('reconnect_failed', function(){
  console.error('Dashboard: SocketIO reconnection failed');
});

socket.on('close', function(){
  console.info('Dashboard: SocketIO connection closed');
});

socket.on('disconnect', function () {
  console.info('Dashboard: SocketIO has disconnected');
});


function App() {

  const projectID = ProjectIDChecker.projectID();

  return (
    <SocketContext.Provider value={socket}>
      <div className="App">
        <Fragment>
          <ErrorBoundary>
            <NavBar projectID={projectID} />
          </ErrorBoundary>
          {(!projectID) ? <ModalNoProjectID /> :
            <Router basename={`${AppConstants.API_ROOT}/performance`}>
              <Route exact={true} path='/' render={(props) => <PagePerformance {...props} projectID={projectID} />} />
              <Route exact={true} path='/charts' render={(props) => <PagePerformance {...props} projectID={projectID} />} />
            </Router >
          }
        </Fragment>
      </div>
    </SocketContext.Provider>
  );
}

export default App;
