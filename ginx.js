#!/usr/bin/env node

var http = require('http');
var https = require('https');
var fs = require('fs');

// Print the help text.
function help() {
	console.log("ginx - simple reverse proxy for virtual hosting");
	console.log("");
	console.log("usage:");
	console.log("\tginx [-p <http_port>] [-a <listen_address>] [-f <forward_address>] [-s <certificate_path> <key_path> [-q <https_port>]] [@|#]<host>:<port>[,...]");
	console.log("");
	console.log("options:");
	console.log("\t-p\tThe port to listen for HTTP traffic on [default: 80].");
	console.log("\t-q\tThe port to listen for HTTPS traffic on [default: 443].");
	console.log("\t-a\tThe address to listen on [default: 0.0.0.0].");
	console.log("\t-f\tThe address to forward requests to [default: 127.0.0.1].");
	console.log("\t-s\tThe certificate and key to use for HTTPS.");
	console.log('');
	console.log('contact:');
	console.log('\thttp://cxii.org/');
	process.exit();
}

// Error.
function error(what) {
	console.log('error: ' + what);
	process.exit();
}

// Generate the HTML for an error page.
function errorHtml(code, text) {
	var e = code + ' ' + http.STATUS_CODES[code];
	return '<html><head><title>' + e + '</title></head><body><center><h1>' + e + '</h1><p>' + text + '</p></center><br><hr><center><p>ginx running on Node.js ' + process.version + '</p></center></body></html>';
}

// Must have at least 1 argument.
if (process.argv.length < 3) {
	help();
}

// Get a more manageable representation of the arguments.
var argv = process.argv.slice(2, process.argv.length);

// Default state.
var httpPort = 80;
var httpsPort = 443;
var isHttpsEnabled = false;
var httpsCertificatePath = '';
var httpsKeyPath = '';
var listenAddress = '0.0.0.0';
var forwardAddress = '127.0.0.1';
var rules = [];
var httpRules = [];
var httpsRules = [];

// Eat the arguments.
while (argv.length > 0) {
	var arg = argv.shift().toLowerCase();
	if (arg == '-p') {
		// HTTP port specification.
		httpPort = argv.shift();
	} else if (arg == '-q') {
		if (!isHttpsEnabled) {
			error('must specify https port after specifying certificate and key');
		}
		// HTTPS port specification.
		httpsPort = argv.shift();
	} else if (arg == '-a') {
		// Listen address specification.
		listenAddress = argv.shift();
	} else if (arg == '-f') {
		// Forward address specification.
		forwardAddress = argv.shift();
	} else if (arg == '-s') {
		// HTTPS enabled.
		isHttpsEnabled = true;
		httpsCertificatePath = argv.shift();
		httpsKeyPath = argv.shift();
	} else {
		// Ruleset specification.
		rules = arg.split(',');
		for (var i = 0; i < rules.length; i++) {
			var rule = rules[i].split(':');
			if (rule.length != 2) {
				error('malformed rule: \'' + rules[i] + '\'');
			}
			var host = rule[0].trim();
			var port = rule[1].trim();
			var mode = 'http';
			if (host.startsWith('@')) {
				if (!isHttpsEnabled) {
					error('must specify https rules after specifying certificate and key: \'' + rules[i] + '\'');
				}
				// HTTPS rule.
				host = host.substr(1);
				mode = 'https';
			} else if (host.startsWith('#')) {
				if (!isHttpsEnabled) {
					error('must specify http+https rules after specifying certificate and key: \'' + rules[i] + '\'');
				}
				// HTTP+HTTPS rule.
				host = host.substr(1);
				mode = 'http+https';
			}
			rules[i] = {host: host, port: port, mode: mode};
		}
	}
}

// Must have at least one rule.
if (rules.length < 1) {
	error('must define at least one rule');
}

// Filter rules.
for (var i = 0; i < rules.length; i++) {
	var mode = rules[i].mode;
	if (mode == 'http') httpRules.push(rules[i]);
	else if (mode == 'https') httpsRules.push(rules[i]);
	else if (mode == 'http+https') {
		httpRules.push(rules[i]);
		httpsRules.push(rules[i]);
	}
}

// Forward.
function forward(protocol, serverRequest, serverResponse, data) {
	// Look for a matching rule. Use the first rule for the default values.
	var rule;
	if (protocol == 'http') {
		rule = httpRules[0];
	} else if (protocol == 'https') {
		rule = httpsRules[0];
	}
	if (serverRequest.headers.hasOwnProperty('host')) {
		var lowerCaseHost = serverRequest.headers['host'].toLowerCase();
		var hostWithoutPort = lowerCaseHost.split(':')[0];
		var matchRules;
		if (protocol == 'http') matchRules = httpRules;
		else if (protocol == 'https') matchRules = httpsRules;
		for (var i = 0; i < matchRules.length; i++) {
			var matchRule = matchRules[i];
			if (hostWithoutPort == matchRule.host) {
				// Found a match.
				rule = matchRule;
			}
		}
	}

	if (protocol == 'http' && rule.mode == 'http+https') {
		// Redirection.
		serverResponse.writeHead(301, {'location': 'https://' + rule.host + ':' + httpsPort + serverRequest.url});
		serverResponse.end();
	} else {
		// Generate options for the forwarding request.
		var forwardOptions = {
			hostname: forwardAddress,
			port: rule.port,
			path: serverRequest.url,
			method: serverRequest.method,
			headers: serverRequest.headers
		};

		// Make sure to imitate the Host header.
		forwardOptions.headers['host'] = rule.host;

		// Create the forwarding request.
		var forwardRequest = http.request(forwardOptions, function(forwardResponse) {
			// Collect data.
			var buffers = [];
			forwardResponse.on('data', function(buffer) {
				buffers.push(buffer);
			});
			forwardResponse.on('end', function() {
				var data = Buffer.concat(buffers);

				// Send it back to the client.
				serverResponse.writeHead(forwardResponse.statusCode, forwardResponse.headers);
				serverResponse.write(data);
				serverResponse.end();
			});
		});

		// Catch errors.
		forwardRequest.on('error', function(e) {
			serverResponse.writeHead(500);
			serverResponse.write(errorHtml(500, e.message));
			serverResponse.end();
		});

		// Write if there was any data.
		if (data != null) {
			forwardRequest.write(data);
		}

		// Send the request.
		forwardRequest.end();
	}
}

// Start the HTTP server.
if (httpRules.length > 0) {
	http.createServer(function(serverRequest, serverResponse) {
		try {
			var data = null;

			if (serverRequest.headers.hasOwnProperty('content-length')) {
				// Request has a body.
				var buffers = [];
				serverRequest.on('data', function(buffer) {
					buffers.push(buffer);
				});
				serverRequest.on('end', function() {
					forward('http', serverRequest, serverResponse, Buffer.concat(buffers));
				});
			} else {
				forward('http', serverRequest, serverResponse);
			}
		} catch (e) {
			// Error. Try to send an error message, although that might fail as well.
			try {
				serverResponse.writeHead(500);
				serverResponse.write(errorHtml(500, e.message));
				serverResponse.end();
			} catch (e) {
				// Who cares?
				'Fuck you.';
			}
		}
	}).listen(httpPort, listenAddress);
}

// Start the HTTPS server.
if (httpsRules.length > 0) {
	var httpsOptions = {
		cert: fs.readFileSync(httpsCertificatePath),
		key: fs.readFileSync(httpsKeyPath)
	};
	https.createServer(httpsOptions, function(serverRequest, serverResponse) {
		try {
			var data = null;

			if (serverRequest.headers.hasOwnProperty('content-length')) {
				// Request has a body.
				var buffers = [];
				serverRequest.on('data', function(buffer) {
					buffers.push(buffer);
				});
				serverRequest.on('end', function() {
					forward('https', serverRequest, serverResponse, Buffer.concat(buffers));
				});
			} else {
				forward('https', serverRequest, serverResponse);
			}
		} catch (e) {
			// Error. Try to send an error message, although that might fail as well.
			try {
				serverResponse.writeHead(500);
				serverResponse.write(errorHtml(500, e.message));
				serverResponse.end();
			} catch (e) {
				// Who cares?
				'Fuck you.';
			}
		}
	}).listen(httpsPort, listenAddress);
}

// Print all rules.
if (httpRules.length > 0) {
	console.log('listening for http traffic on ' + listenAddress + ':' + httpPort);
}
if (httpsRules.length > 0) {
	console.log('listening for https traffic on ' + listenAddress + ':' + httpsPort);
}
for (var i = 0; i < rules.length; i++) {
	var rule = rules[i];
	if (rule.mode == 'http') {
		console.log('http://' + rule.host + ':' + httpPort + '/* -> http://' + forwardAddress + ':' + rule.port + '/*');
	} else if (rule.mode == 'https') {
		console.log('https://' + rule.host + ':' + httpsPort + '/* -> http://' + forwardAddress + ':' + rule.port + '/*');
	} else if (rule.mode == 'http+https') {
		console.log('http://' + rule.host + ':' + httpPort + '/* -> https://' + rule.host + ':' + httpsPort + '/*');
		console.log('https://' + rule.host + ':' + httpsPort + '/* -> http://' + forwardAddress + ':' + rule.port + '/*');
	}
}