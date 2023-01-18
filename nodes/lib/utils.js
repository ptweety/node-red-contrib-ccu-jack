'use strict';

/**
 * Helper function to test an object has a property
 * @param {object} object Object to test
 * @param {string} propertyName Name of property to find
 * @returns true if object has property `propName`
 */
function hasProperty(object, propertyName) {
    return Object.prototype.hasOwnProperty.call(object, propertyName);
}

/**
 * Test a message string is valid JSON
 * @param {string} message
 * @returns {boolean} true if it is valid JSON
 */
function isJson(message) {
    try {
        JSON.parse(message.toString());
    } catch {
        return false;
    }
    return true;
}

/**
 * Test a topic string is valid
 * @param {string} topic
 * @returns {boolean} true if it is a valid topic
 */
function isValidTopic(topic) {
    return /^(#$|(\+|[^#+]*)(\/(\+|[^#+]*))*(\/(\+|#|[^#+]*))?$)/.test(topic);
}

/**
 * Sort any object by key
 * @param {object} object
 * @returns {object} sorted object
 */
function sortObject(object) {
    return (
        Object.keys(object)
            .sort()
            // eslint-disable-next-line unicorn/no-array-reduce
            .reduce((result, key) => ((result[key] = object[key]), result), {})
    );
}

module.exports = { hasProperty, isJson, isValidTopic, sortObject };
