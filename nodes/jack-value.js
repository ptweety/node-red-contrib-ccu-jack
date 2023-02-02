'use strict';

const { statusTypes, eventTypes } = require('./lib/constants');

const nodeConfig = {
    /** @type {runtimeRED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Node Name - has to match with html file and package.json `red` section */
    nodeName: 'jack-value',
};

function nodeInstance(config) {
    const RED = nodeConfig.RED;

    RED.nodes.createNode(this, config);

    this.jack = RED.nodes.getNode(config.jack);

    if (!this.jack) {
        return;
    }

    this.messageQueue = [];
    this.connected = false;

    this.handleMessageQueue = (queueItem) => {
        if (this.connected) {
            if (queueItem && typeof queueItem === 'object') {
                try {
                    const { message, _, done } = queueItem;
                    const {
                        topic,
                        payload,
                        domain = config.domain,
                        device = config.device,
                        channelIndex = config.channelIndex,
                        datapoint = config.datapoint,
                    } = message;

                    this.jack.onInput(config.id, topic, payload, { domain, device, channelIndex, datapoint }, done);
                    // if (done) done();

                    this.messageQueue.shift();
                    if (this.messageQueue.length > 0) this.handleMessageQueue(this.messageQueue[0]);
                } catch {
                    //
                }
            } else {
                if (this.messageQueue.length > 0) this.handleMessageQueue(this.messageQueue[0]);
            }
        }
    };

    this.jack.register(this, eventTypes.STATUS, (message) => {
        this.status(message.payload);
        this.connected = message.status === statusTypes.CONNECTED ? true : false;
        this.handleMessageQueue();
        // this.send(message);
    });

    if (config.cache) {
        this.filter = {
            domain: config.domain,
            change: config.change,
            cache: config.cache,
        };

        for (const attribute of ['device', 'channelIndex', 'datapoint']) {
            if (!config[attribute]) {
                continue;
            }

            this.filter[attribute] =
                config[attribute + 'T'] === 're' ? new RegExp(config[attribute]) : config[attribute];
        }

        this.jack.subscribe(this, eventTypes.EVENT, (message) => {
            message.topic = config.topic === '*' ? message.topic : this.jack.topicReplace(config.topic, message);
            if (message.cache) this.send(message);
        });
    }

    this.jack.subscribe(this, eventTypes.VALUE, (message) => {
        message.topic = config.topic === '*' ? message.topic : this.jack.topicReplace(config.topic, message);
        this.send(message);
    });

    this.jack.subscribe(this, eventTypes.ERROR, (message) => {
        this.error(message.error);
    });

    this.on('input', (message, send, done) => {
        // send = send || function () { node.send.apply(node, arguments); };
        // done = done || function() { node.done.apply(node, arguments); }

        if (message) {
            this.messageQueue.push({ message, send, done });
            if (this.messageQueue.length === 1) this.handleMessageQueue(this.messageQueue[0]);
        } else if (done) done();
    });

    this.on('close', (done) => {
        if (this.jack) {
            this.jack.deregister(this, done);
            this.jack = undefined;
        } else done();
    });
}

module.exports = (RED) => {
    nodeConfig.RED = RED;

    RED.nodes.registerType(nodeConfig.nodeName, nodeInstance);
};
