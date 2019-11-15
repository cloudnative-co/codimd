'use strict'
const fs = require('fs')
const path = require('path')
const uuid = require('uuid/v4');
const boxSDK = require('box-node-sdk');
const {promisify} = require('util');

const config = require('./config')
const { getImageMimeType } = require('./utils')
const logger = require('./logger')
const models = require('./models')
const box = boxSDK.getPreconfiguredInstance(config.box);
const client = box.getAppAuthClient('enterprise', config.box.enterpriseID);
const folderID = config.box.folderID


function getExpiringEmbedLink(fileID, callback) {
    client.files.update(fileID, {
            shared_link: {
                access: config.box.imageAccessLevel,
                permissions: config.box.permissions
            }
        }
    ).then(file => {
        console.log(file)
        return file.shared_link.url
    }).then(url => {
        console.log(url)
        url = url.replace("box.com", "app.box.com/embed")
        console.log(url)
        callback(url)
    }).catch(error => {
       logger.error(error)
        callback(null)
    })
}

exports.embed = getExpiringEmbedLink
