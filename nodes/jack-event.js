'use strict';

const { statusTypes } = require('./lib/constants');

const nodeConfig = {
    /** @type {runtimeRED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Node Name - has to match with html file and package.json `red` section */
    nodeName: 'jack-event',
};

function nodeInstance(config) {
    const RED = nodeConfig.RED;

    RED.nodes.createNode(this, config);

    this.jack = RED.nodes.getNode(config.jack);

    if (!this.jack) {
        return;
    }

    this.connected = false;

    this.jack.register(this, async (message) => {
        switch (message.topic) {
            case 'status': {
                this.status(message.payload);
                this.connected = message.status === statusTypes.CONNECTED ? true : false;
            }
        }
        // this.send(message);
    });

    this.filter = {
        domain: config.domain,
        change: config.change,
        cache: config.cache,
    };

    for (const attribute of [
        'room',
        'function',
        'rooms',
        'functions',
        'device',
        'deviceName',
        'deviceType',
        'channel',
        'channelName',
        'channelType',
        'channelIndex',
        'datapoint',
        'program',
        'programName',
        'sysvar',
        'sysvarName',
    ]) {
        if (!config[attribute]) {
            continue;
        }

        const attribute_ = attribute === 'room' || attribute === 'function' ? attribute + 's' : attribute;
        this.filter[attribute_] =
            config[attribute + 'T'] === 'strs'
                ? new RegExp(config[attribute].replaceAll(',', '|'))
                : config[attribute + 'T'] === 're'
                ? new RegExp(config[attribute])
                : config[attribute];
    }

    this.jack.subscribe(this, async (message) => {
        message.topic = config.topic === '*' ? message.topic : this.jack.topicReplace(config.topic, message);
        this.send(message);
    });

    this.on('close', () => {
        this.jack.deregister(this);
    });
}

module.exports = (RED) => {
    nodeConfig.RED = RED;

    RED.nodes.registerType(nodeConfig.nodeName, nodeInstance);
};
