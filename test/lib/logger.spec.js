'use strict';

const { logLevels, Logger } = require('../../nodes/lib/logger');

describe('logger', () => {
    const log = console.log; // save original console.log function

    beforeEach(() => {
        console.log = jest.fn(); // create a new mock function for each test
    });

    afterEach(() => {
        console.log = log; // restore original console.log after all tests
    });

    it('should return a Logger (happy path)', () => {
        const testLogger = new Logger();
        expect(testLogger).toBeInstanceOf(Logger);
        expect(testLogger.currentLevel).toBe(logLevels.DEBUG);
        expect(testLogger.currentTag).toBe('Logger');
    });

    it('should log simple message (happy path)', () => {
        const testLogger = new Logger();
        testLogger.info = jest.fn();
        testLogger.info('hello');
        expect(testLogger.info).toHaveBeenCalledWith('hello');
    });

    it('should log info message on debug level', () => {
        const testLogger = new Logger(logLevels.DEBUG);
        testLogger.info = jest.fn();
        testLogger.info('debug');
        expect(testLogger.info).toHaveBeenCalledWith('debug');
    });

    it('should log message with tag', () => {
        const testLogger = new Logger(logLevels.DEBUG, 'tag');
        expect(testLogger.currentTag).toBe('tag');
        testLogger.info('tag-text');
        expect(console.log).toHaveBeenLastCalledWith(expect.anything(), expect.stringContaining('tag-text'));
    });

    it('should not log at silent level', () => {
        const testLogger = new Logger(logLevels.SILENT, 'SILENT');
        testLogger.info('silent');
        expect(console.log).not.toHaveBeenCalled();
    });

    it('should call shouldLog', () => {
        const testLogger = new Logger(logLevels.DEBUG, 'ShouldLog');
        testLogger.shouldLog = jest.fn();
        testLogger.info('silent');
        expect(testLogger.shouldLog).toHaveBeenCalledWith(logLevels.INFO);
    });

    it('should call get now', () => {
        const testLogger = new Logger(logLevels.DEBUG, 'Now');
        expect(testLogger.now).toBeDefined();
        jest.spyOn(testLogger, 'now', 'get').mockReturnValue('date');
        testLogger.info('get now');
        expect(testLogger.now).toEqual('date');
    });

    it('should log messages on all level', () => {
        const testLogger = new Logger(logLevels.ALL);
        testLogger.fatal('all');
        expect(console.log).toHaveBeenCalled();
        testLogger.error('all');
        expect(console.log).toHaveBeenCalled();
        testLogger.warn('all');
        expect(console.log).toHaveBeenCalled();
        testLogger.info('all');
        expect(console.log).toHaveBeenCalled();
        testLogger.debug('all');
        expect(console.log).toHaveBeenCalled();
        testLogger.trace('all');
        expect(console.log).toHaveBeenCalled();
    });
});
