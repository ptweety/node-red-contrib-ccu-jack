'use strict';

const { hasProperty, isJson, isValidTopic, sortObject } = require('../../nodes/lib/utils');

describe('utils', () => {
    it('should return something (happy path)', () => {
        const result = hasProperty({ it: true }, 'it');
        expect(result).toBe(true);
        expect(result).not.toBe(false);
    });

    it('should return true for valid JSON', () => {
        expect(isJson(JSON.stringify({ is: true }))).toBe(true);
    });

    it('should return false for empty JSON', () => {
        expect(isJson()).toBe(false);
    });

    it('should return true for valid topic', () => {
        expect(isValidTopic('/test/test')).toBe(true);
    });

    it('should return false for invalid topic', () => {
        expect(isValidTopic('##')).toBe(false);
    });

    it('should return sorted object', () => {
        expect(sortObject({ b: true, a: true })).toEqual({ a: true, b: true });
    });
});
