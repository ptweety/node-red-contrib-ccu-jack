'use strict';

module.exports = {
    deviceChannels: {
        device: {
            'BidCoS-RF': {
                0: {
                    '.': {
                        address: 'BidCoS-RF:0',
                        children: ['$MASTER', 'INSTALL_MODE'],
                        rooms: [],
                        functions: [],
                        identifier: '0',
                        parent: 'BidCoS-RF',
                        '~links': [
                            { href: '$MASTER', rel: 'parameter', title: 'HM-RCV-50 BidCoS-RF:0 - $MASTER' },
                            { href: 'INSTALL_MODE', rel: 'parameter', title: 'HM-RCV-50 BidCoS-RF:0 - INSTALL_MODE' },
                            { href: '..', rel: 'device', title: 'HM-RCV-50 BidCoS-RF' },
                        ],
                        '~path': '/device/BidCoS-RF/0',
                    },
                },
                1: {
                    '.': {
                        address: 'BidCoS-RF:1',
                        children: ['$MASTER', 'LEVEL', 'PRESS_LONG', 'PRESS_SHORT'],
                        rooms: ['1230'],
                        functions: ['1220'],
                        identifier: '1',
                        parent: 'BidCoS-RF',
                        '~links': [
                            { href: '$MASTER', rel: 'parameter', title: 'HM-RCV-50 BidCoS-RF:1 - $MASTER' },
                            { href: 'LEVEL', rel: 'parameter', title: 'HM-RCV-50 BidCoS-RF:1 - LEVEL' },
                            { href: 'PRESS_LONG', rel: 'parameter', title: 'HM-RCV-50 BidCoS-RF:1 - PRESS_LONG' },
                            { href: 'PRESS_SHORT', rel: 'parameter', title: 'HM-RCV-50 BidCoS-RF:1 - PRESS_SHORT' },
                            { href: '..', rel: 'device', title: 'HM-RCV-50 BidCoS-RF' },
                            { href: '/function/1220', rel: 'function', title: 'Zentrale' },
                            { href: '/room/1230', rel: 'room', title: 'Kammer' },
                        ],
                        '~path': '/device/BidCoS-RF/1',
                    },
                },
            },
        },
    },
    channelDatapoints: {
        device: {
            'BidCoS-RF': {
                0: {
                    INSTALL_MODE: {
                        '.': {
                            identifier: 'INSTALL_MODE',
                            title: 'HM-RCV-50 BidCoS-RF:0 - INSTALL_MODE',
                            '~links': [
                                { href: '..', rel: 'channel', title: 'HM-RCV-50 BidCoS-RF:0' },
                                { href: '~pv', rel: '~service', title: 'PV Service' },
                            ],
                            '~path': '/device/BidCoS-RF/0/INSTALL_MODE',
                        },
                    },
                },
                1: {
                    LEVEL: {
                        '.': {
                            identifier: 'LEVEL',
                            title: 'HM-RCV-50 BidCoS-RF:1 - LEVEL',
                            '~links': [
                                { href: '..', rel: 'channel', title: 'HM-RCV-50 BidCoS-RF:1' },
                                { href: '~pv', rel: '~service', title: 'PV Service' },
                            ],
                            '~path': '/device/BidCoS-RF/1/LEVEL',
                        },
                    },
                    PRESS_LONG: {
                        '.': {
                            identifier: 'PRESS_LONG',
                            title: 'HM-RCV-50 BidCoS-RF:1 - PRESS_LONG',
                            '~links': [
                                { href: '..', rel: 'channel', title: 'HM-RCV-50 BidCoS-RF:1' },
                                { href: '~pv', rel: '~service', title: 'PV Service' },
                            ],
                            '~path': '/device/BidCoS-RF/1/PRESS_LONG',
                        },
                    },
                },
            },
        },
    },
};
