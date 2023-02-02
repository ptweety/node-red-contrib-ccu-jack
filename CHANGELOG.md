### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [v0.0.9](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.8...v0.0.9)

- fix: add status message if connecting to jack-bridge [`19b04d6`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/19b04d68a45d77c5eef61dcec0f163733844e295)
- fix: jack tests [`7d45e79`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/7d45e7960d38bf70cd680ecc8e0b3903d64f8158)
- refactor: status handling and start/stop behavior [`9115742`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/911574275f29acfa229387e9d81201115a4c2cbd)
- docs: i18n for some error messages in jack-config [`0446865`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/0446865e64d4fc548dd2ba5d3391c5d1c3210c09)
- feat: prepare usage of jacks refresh information [`487593a`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/487593adca724f604151a4f1d7dc413072703311)
- fix: improve duplicate check in jack-bridge [`b2abc41`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/b2abc419306e0f59a73f4712a2154ebc4cd71d0b)
- fix: restructure output in global context [`8fbeadd`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/8fbeadd850208c5f3071c017537120a389285c15)
- fix: limit internal status events on deploy [`1847283`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/184728301cb3615d2f247b94a2f38e201b6a592b)
- fix: messages with retain false and error handling [`8c1a2ac`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/8c1a2ac52e5fe64e5616f3dd5e8435516d1690b9)

#### [v0.0.8](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.7...v0.0.8)

> 29 January 2023

- chore: bump version to 0.0.8 [`9626f86`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/9626f86f950cf6e43fddc1e86bb0d4777257302c)
- feat: add getValues* status options to jack-bridge [`434a1b3`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/434a1b386522f584ed5f0472d85e47e230e5172c)
- feat: add option to disable auto connect [`c33796e`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/c33796ec5b2dbffd8a988778a311cc4826b0dae2)
- docs: update examples [`80ab43f`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/80ab43f99d2a59c791b2febd84a58c53fb80ea6c)
- fix: add enum for type of domains [`8c6a844`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/8c6a8444aa6a1fb7d906438d37d4155ed111973a)

#### [v0.0.7](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.6...v0.0.7)

> 28 January 2023

- chore: bump version to 0.0.7 [`135ff68`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/135ff68a9744880caea029cca16cb7e2b8cb2657)
- feat: add option to store copy of internal context in global context [`2c9de30`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/2c9de301e0e0b13a2a3eb1899096731ae85d6e1e)
- docs: update README and CONTRIBUTING [`8f70cd0`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/8f70cd0e9ac105c06951db4ed9fa5034a2941e3c)
- docs: update examples and jack-bridge [`481bece`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/481bece904a2833f1194669939ba461c413bdb2f)
- docs: add jack-value, update jack-event [`e7323f5`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/e7323f557f36a238a3090a1f3bd18894b06fa470)

#### [v0.0.6](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.5...v0.0.6)

> 27 January 2023

- chore: bump version to 0.0.6 [`3750687`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/3750687c2d568ea6e0068cf6152726c22a74c54a)
- feat: add values to global context [`eb8a893`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/eb8a893b89deb59b1271d0775b050e3f3c02a174)
- chore: update dependencies [`cbbb331`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/cbbb331bc97ab3670ecd4e3b378bc820ec980dd3)
- fix: add feature flag for development to hide e.g. updates to global context [`f44144e`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/f44144ed95a5870b203fb892dcde38ecf692dc99)
- fix: add missing payload.v when calling prepareReply [`b8d372c`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/b8d372cc15aadb261a6dcb359054238b2e3a5fb3)

#### [v0.0.5](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.4...v0.0.5)

> 25 January 2023

- chore: bump version to 0.0.5 [`d5d950f`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/d5d950f5d01d88e360102121eaec73a9c1ce8ea5)
- fix: reduce datapoints object to only show values [`68b010e`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/68b010e76803ccedb968fa33fb8b9c897a512551)
- fix: add missing ...Value for ...Type = ENUM in message [`bc50f76`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/bc50f76b1af06a4e2cd3fe1375845142bf11cb41)
- fix: improve interaction with mqtt node [`b8d42a4`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/b8d42a4d2263f2aea4aaa65ff2fb1a7ebc901034)

#### [v0.0.4](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.3...v0.0.4)

> 24 January 2023

- chore: bump version to 0.0.4 [`9e7609a`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/9e7609a7a8cfd69c4b2b8c5a750fe8f8f90d8819)
- feat: add new jack-value node [`c156ab1`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/c156ab11591fdcadc78e7066e56f604d19f3e470)
- refactor: internal event handling [`529873b`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/529873b5e8cf87c38b95bfe77caf629af20bd131)

#### [v0.0.3](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.2...v0.0.3)

> 23 January 2023

- chore: bump version to 0.0.3 [`45e1eaa`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/45e1eaa9b5e6b7bf4c768ca34c6716ba8048f84a)
- fix: minor code clean up [`98ea9c5`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/98ea9c536e947bd6136719d684160548c588d837)
- fix: autoComplete filter wasn't corret [`8029f77`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/8029f77b215b6564dfec0cdbb45978b3f47e6cc5)
- docs: play with colors and icons [`b89bdf7`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/b89bdf7cbf025fe8f9a5305f7cabbb40fc1fcfd0)
- docs: add and improve help for jack-event [`b2fbd0c`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/b2fbd0c57d8152532dd9568473a76dc840c46945)
- refactor: rename node jack-value to jack-event [`e063fdb`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/e063fdbacee289996a0b1e571ece792a204c4eb1)

#### [v0.0.2](https://github.com/ptweety/node-red-contrib-ccu-jack/compare/v0.0.1...v0.0.2)

> 19 January 2023

- chore: bump version to 0.0.2 [`c42cef4`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/c42cef493c401476e94ecc74f81eb3115c4c62ad)
- build: add scripts for version and postversion [`0bd9c37`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/0bd9c37ef7bb85e586499ffbde71c6b9a91808b1)
- docs: add CHANGELOG.md [`791dd23`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/791dd2395337d2376791ead28218d823c971c1d4)
- build: add auto-changelog [`957d045`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/957d04554ba552515a5a4cfe57ac4d177a3e2964)
- docs: add contribution guide [`0b4de02`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/0b4de02e0ce7c84bfef4bdd65dbb05d629a68af6)
- chore: update packages [`d09840a`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/d09840a4452c1ca775d0e300e876c9dac80a1c0b)
- fix: jest.config.js to ignore test data [`6db76a8`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/6db76a8db90be0eced0686f3257bcb6f5e1ce3fd)
- style: add plug icon to port input [`d33137f`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/d33137f83670514ecfe1ac48404518458c557748)

#### v0.0.1

> 19 January 2023

- Initial commit [`de32d0f`](https://github.com/ptweety/node-red-contrib-ccu-jack/commit/de32d0f4a26fbd895f06b4a9fcfdc23d3bab3790)
