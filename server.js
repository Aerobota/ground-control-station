var mavlink = require("mavlink_ardupilotmega_v1.0"),
    UavConnection = require("./assets/js/libs/uavConnection.js"),
    MavParams = require("./assets/js/libs/mavParam.js"),
    express = require('express'),
    routes = require('./routes'),
    app = express(),
    http = require('http'),
    nowjs = require("now"),
    path = require('path'),
    nconf = require("nconf"),
    requirejs = require("requirejs"),
    winston = require("winston"),
    MavFlightMode = require("./assets/js/libs/mavFlightMode.js"),
    MavMission = require('./assets/js/libs/mavMission.js'),
    quadUdl = require("./assets/js/libs/udlImplementations/quadcopter.js");

requirejs.config({
    //Pass the top-level main.js/index.js require
    //function to requirejs so that node modules
    //are loaded relative to the top-level JS file.
    baseUrl: './app'
});

// Logger
var logger = new(winston.Logger)({
    transports: [
        new(winston.transports.File)({
            filename: 'mavlink.dev.log'
        })
    ]
});

// Fetch configuration information.
nconf.argv().env().file({
    file: 'config.json'
});

app.configure(function() {
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function() {
    app.use(express.errorHandler());
});

app.get('/', routes.index);

// We need to take care with syntax when using Express 3.x and Socket.io.
// https://github.com/Flotype/now/issues/200
var server = http.createServer(app).listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});

// Set up connections between clients/server
var everyone = nowjs.initialize(server);

// Establish parser
var mavlinkParser = new mavlink(logger);

// Establish connection management, start its heartbeat.
var uavConnectionManager = new UavConnection.UavConnection(nconf, mavlinkParser, logger);
mavlinkParser.setConnection(uavConnectionManager);
uavConnectionManager.start();

var mavFlightMode = new MavFlightMode(mavlink, mavlinkParser, uavConnectionManager, logger);

var quad = new quadUdl(logger, nconf);
quad.setProtocol(mavlinkParser);

// MavParams are for handling loading parameters
// Just hacking/playing code for now
var mavParams = new MavParams(logger);

// User clicked 'load params'!
everyone.now.loadParams = function(msg) {
    console.log('LOADING PARAMS');
}

everyone.now.loadMission = function(msg) {
    console.log('LOADING MISSION')
    var mm= new MavMission(mavlink, mavlinkParser, uavConnectionManager, logger);
    mm.loadMission();
}

everyone.now.startMission = function(msg) {
    console.log('taking off');
    quad.takeoff();
}

// Client integration code, TODO refactor away to elsewhere
requirejs(["Models/Platform","now"], function(Platform, now) {

// eat error for the moment, remove this soon!
    var connection = {};

    uavConnectionManager.on('disconnected', function() {
        connection = _.extend(connection, {
            status: uavConnectionManager.getState(),
            time_since_last_heartbeat: uavConnectionManager.timeSinceLastHeartbeat
        });
        everyone.now.updateConnection(connection);
    })

    uavConnectionManager.on('connecting', function() {
        connection = _.extend(connection, {
            status: uavConnectionManager.getState(),
            time_since_last_heartbeat: uavConnectionManager.timeSinceLastHeartbeat
        });
        everyone.now.updateConnection(connection);
    })

    uavConnectionManager.on('connected', function() {
        connection = _.extend(connection, {
            status: uavConnectionManager.getState(),
            time_since_last_heartbeat: uavConnectionManager.timeSinceLastHeartbeat
        });
        everyone.now.updateConnection(connection);
    })

    var platform = {};

    mavFlightMode.on('change', function() {
        platform = _.extend(platform, mavFlightMode.getState());
        everyone.now.updatePlatform(platform);
    });

    // This won't scale =P still
    // But it's closer to what we want to do.
    mavlinkParser.on('HEARTBEAT', function(message) {
        platform = _.extend(platform, {
            type: message.type,
            autopilot: message.autopilot,
            base_mode: message.base_mode,
            custom_mode: message.custom_mode,
            system_status: message.system_status,
            mavlink_version: message.mavlink_version
        });
        everyone.now.updatePlatform(platform);
    });

    mavlinkParser.on('GLOBAL_POSITION_INT', function(message) {
        platform = _.extend(platform, {
            lat: message.lat / 10000000,
            lon: message.lon / 10000000,
            alt: message.alt / 1000,
            relative_alt: message.relative_alt / 1000,
            vx: message.vx / 100,
            vy: message.vy / 100,
            vz: message.vz / 100,
            hdg: message.hdg / 100
        });
        everyone.now.updatePlatform(platform);
    });

    mavlinkParser.on('SYS_STATUS', function(message) {
        platform = _.extend(platform, {
            voltage_battery: message.voltage_battery,
            current_battery: message.current_battery,
            battery_remaining: message.battery_remaining,
            drop_rate_comm: message.drop_rate_comm,
            errors_comm: message.errors_comm
        });
        everyone.now.updatePlatform(platform);
    });

    mavlinkParser.on('ATTITUDE', function(message) {
        platform = _.extend(platform, {
            pitch: message.pitch,
            roll: message.roll,
            yaw: message.yaw,
            pitchspeed: message.pitchspeed,
            rollspeed: message.rollspeed,
            yawspeed: message.yawspeed
        });
        everyone.now.updatePlatform(platform);
    });

    mavlinkParser.on('VFR_HUD', function(message) {
        platform = _.extend(platform, {
            airspeed: message.airspeed,
            groundspeed: message.groundspeed,
            heading: message.heading,
            throttle: message.throttle,
            climb: message.climb
        });
        everyone.now.updatePlatform(platform);

    });

    mavlinkParser.on('GPS_RAW_INT', function(message) {
        platform = _.extend(platform, {
            fix_type: message.fix_type,
            satellites_visible: message.satellites_visible,
            lat: message.lat / 10000000,
            lon: message.lon / 10000000,
            alt: message.alt / 1000,
            eph: message.eph,
            epv: message.epv,
            vel: message.vel,
            cog: message.cog
        });
        everyone.now.updatePlatform(platform);
    });

}); // end scope of requirejs
