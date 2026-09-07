'use strict';

const express = require('express');
const { buildVersionPayload } = require('../services/buildVersion');

const router = express.Router();

router.get('/build-version', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.json(buildVersionPayload(req));
});

module.exports = router;
