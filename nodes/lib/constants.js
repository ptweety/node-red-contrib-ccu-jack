'use strict';

const statusTypes = { BLANK: 0, CONNECTED: 1, NOTCONNECTED: 2, DISCONNECTED: 3, CONNECTING: 4, ERROR: 5, OK: 6 };
const statusMessages = {
    0: {},
    1: { fill: 'green', shape: 'dot', text: 'node-red:common.status.connected' },
    2: { fill: 'yellow', shape: 'dot', text: 'node-red:common.status.not-connected' },
    3: { fill: 'red', shape: 'ring', text: 'node-red:common.status.disconnected' },
    4: { fill: 'yellow', shape: 'ring', text: 'node-red:common.status.connecting' },
    5: { fill: 'red', shape: 'ring', text: 'node-red:common.status.error' },
    6: { fill: 'green', shape: 'ring', text: 'node-red:common.status.ok' },
};

const domainTypes = {
    DEVICE: 'device',
    FUNCTION: 'function',
    ROOM: 'room',
    PROGRAM: 'program',
    SYSVAR: 'sysvar',
    VIRTDEV: 'virtdev',
};

const eventTypes = { ERROR: 'error', STATUS: 'status', EVENT: 'event', VALUE: 'value' };

module.exports = { statusTypes, statusMessages, domainTypes, eventTypes };
