'use strict';

/**
 * Logging util
 * @module Logger
 */

/** @constant {object} logLevels to indicate the severity */
const logLevels = { SILENT: 0, FATAL: 10, ERROR: 20, WARN: 30, INFO: 40, DEBUG: 50, TRACE: 60, ALL: 100 };

/** @constant {object} logLevelNames for different log levels*/
const logLevelNames = { 10: 'fatal', 20: 'error', 30: 'warn', 40: 'info', 50: 'debug', 60: 'trace', 100: 'all' };

/**
 * A Logger
 * @param {number} level Maximum severity which should be logged
 * @param {string} tag Tag each logged item
 */
function Logger(level, tag) {
    this.currentLevel = typeof level === 'number' && logLevels.SILENT <= level && level <= logLevels.ALL ? level : 50;
    this.currentTag = typeof tag === 'string' ? tag : 'Logger';
}

Logger.prototype = {
    /**
     * Return a formatted datetime string
     * @type {string} Current date & time formatted for logging
     */
    get now() {
        return new Date().toLocaleString(undefined, {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });
    },

    /**
     * Evaluate if logging should happen
     * @memberof Logger
     * @param {number} level Severity level
     */
    shouldLog: function (level) {
        return logLevels.SILENT < level && level <= this.currentLevel;
    },

    /**
     * Log a message object
     * @memberof Logger
     * @param {object} object Object to log
     * @param {number} object.level Severity level of the message
     * @param {*} object.message Message to log
     */
    log: function ({ level, message }) {
        console.log(this.now + ` - [${logLevelNames[level]}] [${this.currentTag}]`, message);
    },

    /**
     * Log a message at FATAL level
     * @memberof Logger
     */
    fatal: function (message) {
        if (this.shouldLog(logLevels.FATAL)) this.log({ level: logLevels.FATAL, message });
    },

    /**
     * Log a message at ERROR level
     * @memberof Logger
     */
    error: function (message) {
        if (this.shouldLog(logLevels.ERROR)) this.log({ level: logLevels.ERROR, message });
    },

    /**
     * Log a message at WARN level
     * @memberof Logger
     */
    warn: function (message) {
        if (this.shouldLog(logLevels.WARN)) this.log({ level: logLevels.WARN, message });
    },

    /**
     * Log a message at INFO level
     * @memberof Logger
     */
    info: function (message) {
        if (this.shouldLog(logLevels.INFO)) this.log({ level: logLevels.INFO, message });
    },

    /**
     * Log a message at DEBUG level
     * @memberof Logger
     */
    debug: function (message) {
        if (this.shouldLog(logLevels.DEBUG)) this.log({ level: logLevels.DEBUG, message });
    },

    /**
     * Log a message at TRACE level
     * @memberof Logger
     */
    trace: function (message) {
        if (this.shouldLog(logLevels.TRACE)) this.log({ level: logLevels.TRACE, message });
    },
};

// EXPORT
module.exports = { logLevels, logLevelNames, Logger };
