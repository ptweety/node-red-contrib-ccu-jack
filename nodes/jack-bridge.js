'use strict';

const { statusTypes } = require('./lib/constants');

const nodeConfig = {
    /** @type {runtimeRED} Reference to the master RED instance */
    RED: undefined,
    /** @type {string} Node Name - has to match with html file and package.json `red` section */
    nodeName: 'jack-bridge',
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
    this.statusMessage = {};
    this.timerQueueDepth;

    this.reportDepth = () => {
        if (this.timerQueueDepth !== null) clearTimeout(this.timerQueueDepth);

        if (this.messageQueue.length > 1) {
            this.status({ fill: 'blue', shape: 'dot', text: this.messageQueue.length });

            this.timerQueueDepth = setTimeout(() => {
                this.reportDepth();
            }, 500);
        } else {
            this.status(this.statusMessage);
        }
    };

    this.handleMessageQueue = async (queueItem) => {
        if (this.connected) {
            this.reportDepth();

            if (queueItem && typeof queueItem === 'object') {
                try {
                    const { message, _, done } = queueItem;
                    const { topic, payload, qos, retain } = message;

                    this.jack.onMessage(topic, payload, { qos, retain }, done);
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

    this.jack.register(this, async (message) => {
        switch (message.topic) {
            case 'status': {
                this.statusMessage = message.payload;
                this.status(this.statusMessage);
                this.connected = message.status === statusTypes.CONNECTED ? true : false;
                this.handleMessageQueue();
                if (this.connected) {
                    // eslint-disable-next-line unicorn/no-null
                    this.send([null, { topic: ['#'], action: 'subscribe' }]);
                } else {
                    // eslint-disable-next-line unicorn/no-null
                    this.send([null, { topic: ['#'], action: 'unsubscribe' }]);
                }
            }
        }
        this.send(message);
    });

    this.on('input', (message, send, done) => {
        // send = send || function () { node.send.apply(node, arguments); };
        // done = done || function() { node.done.apply(node, arguments); }

        if (message && message.action && !message.payload) {
            // eslint-disable-next-line unicorn/no-null
            send([null, message]);
        } else if (message && message.status) {
            // TODO
        } else if (message && message.topic && message.payload && message.qos && message.retain) {
            this.messageQueue.push({ message, send, done });
            if (this.messageQueue.length === 1) this.handleMessageQueue(this.messageQueue[0]);
        }
    });

    this.on('close', () => {
        this.jack.deregister(this);
    });
}

module.exports = (RED) => {
    nodeConfig.RED = RED;

    RED.nodes.registerType(nodeConfig.nodeName, nodeInstance);
};
