'use strict';

const { isValidTopic } = require('./lib/utils');
const { statusTypes, domainTypes, eventTypes } = require('./lib/constants');

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

    RED.nodes.eachNode((n) => {
        if (n.type === this.type && n.id !== this.id && n.jack === this.jack.id) {
            this.error(
                `Another [${n.type}:${n.id}] was found, using the same [${this.jack.type}:${this.jack.id}] known as "${this.jack.name}". This may lead to problems and should be avoided!`
            );
        }
    });

    this.messageQueue = [];
    this.connected = false;
    this.statusMessage = {};
    this.rootDomains = new Set();
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

    this.handleMessageQueue = (queueItem) => {
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

    this.jack.register(this, eventTypes.STATUS, (message) => {
        this.statusMessage = message.payload;
        this.connected = message.status === statusTypes.CONNECTED ? true : false;
        this.status(this.statusMessage);

        if (this.connected) {
            if (Array.isArray(message.domains) && message.domains.length > 0)
                for (const domain of message.domains) {
                    if (
                        [domainTypes.DEVICE, domainTypes.PROGRAM, domainTypes.SYSVAR, domainTypes.VIRTDEV].includes(
                            domain
                        )
                    )
                        this.rootDomains.add(`${domain}/#`);
                }

            // eslint-disable-next-line unicorn/no-null
            this.send([null, [{ action: 'connect' }, { topic: [...this.rootDomains], action: 'subscribe' }]]);
            this.handleMessageQueue();
        } else {
            if (this.rootDomains.length > 0)
                // eslint-disable-next-line unicorn/no-null
                this.send([null, { topic: [...this.rootDomains], action: 'unsubscribe' }]);
        }
        // this.send(message);
    });

    this.on('input', (message, send, done) => {
        // send = send || function () { node.send.apply(node, arguments); };
        // done = done || function() { node.done.apply(node, arguments); }

        if (message) {
            if (message.action && !message.status) {
                if (['getSubscriptions'].includes(message.action))
                    // eslint-disable-next-line unicorn/no-null
                    send([null, { action: message.action, status: '__get' }]);
                if (done) done();
            } else if (message.status) {
                send({ topic: message.topic, payload: message.payload });
                if (done) done();
            } else if (message.topic && message.payload && message.qos && message.retain) {
                if (isValidTopic(message.topic)) this.messageQueue.push({ message, send, done });
                if (this.messageQueue.length === 1) this.handleMessageQueue(this.messageQueue[0]);
            }
        } else if (done) done();
    });

    this.on('close', () => {
        if (this.rootDomains.length > 0)
            // eslint-disable-next-line unicorn/no-null
            this.send([null, { topic: this.rootDomains, action: 'unsubscribe' }]);

        this.jack.deregister(this);
    });
}

module.exports = (RED) => {
    nodeConfig.RED = RED;

    RED.nodes.registerType(nodeConfig.nodeName, nodeInstance);
};
