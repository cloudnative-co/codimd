'use strict'
const fs = require('fs')
const path = require('path')
const config = require('../../config')
const { getImageMimeType } = require('../../utils')
const logger = require('../../logger')
const {promisify} = require('util');
const models = require('../../models')
const uuid = require('uuid/v4');
const boxSDK = require('box-node-sdk');
const box = boxSDK.getPreconfiguredInstance(config.box);
const client = box.getAppAuthClient('enterprise', config.box.enterpriseID);
const folderID = config.box.folderID



exports.uploadImage = function (imagePath, req, callback) {
    if (!imagePath || typeof imagePath !== 'string') {
        callback(new Error('Image path is missing or wrong'), null)
        return
    }
    if (!callback || typeof callback !== 'function') {
        logger.error('Callback has to be a function')
        return
    }
    if (folderID === undefined) {
        logger.error('Box folder-Id was not set.')
        return
    }
    client.folders.get(folderID).catch(error => {
        logger.error('Box folder-Id was not found.')
        callback(new Error(error), null)
        return
    })

    models.User.findOne({where: {id: req.user.id}}).then(user => {
        if (!user) { return }
        var profile = models.User.getProfile(user)
        return profile.name
    }).then(name => {
        return client.folders.getItems(folderID).then(items => {
            for (var idx in items.entries){
                if (items.entries[idx].name == name) {
                    return {found: true, id: items.entries[idx].id, name: name}
                }
            }
            return {found: false, id: null, name: name}
        })
    }).then(data => {
        if (! data.found){
            return client.folders.create(folderID, data.name).then(folder => {
                return folder.id
            });
        }
        return data.id
    }).then(id => {
        const readFile = promisify(fs.readFile);
        return readFile(imagePath).then(buffer => {
            var fid = uuid.v4().split('-').join('')
            var ext = path.extname(imagePath);
            var boxFileName = fid + ext
            return client.files.uploadFile(folderID, boxFileName, buffer).then(file => {
                return file.entries[0].id
            })
        })
    }).then(fileID => {
        return client.files.update(fileID, {shared_link: client.accessLevels.DEFAULT}).then(file => {
            return file.shared_link.download_url
        })
    }).then(link => {
        callback(null, link)
    }).catch(error => {
       logger.error(error)
        callback(new Error(error), null)
    })
    /*




  fs.readFile(imagePath, function (err, buffer) {
    if (err) {
      callback(new Error(err), null)
      return
    }
    var id = uuid.v4().split('-').join('')
    var ext = path.extname(imagePath);
    var boxFileName = id + ext
     // Boxへファイルのアップロード
    client.files.uploadFile(folderID, boxFileName, buffer)
      .then(file => {
        logger.debug(JSON.stringify(file))
        var fileID = file.entries[0].id
        logger.debug(fileID)
        // Box共有リンク作成
        client.files.update(fileID, {shared_link: client.accessLevels.DEFAULT})
          .then(file => {
            logger.debug(JSON.stringify(file))
        client.files.update(fileID, {shared_link: client.accessLevels.DEFAULT})
        var link = file.shared_link.download_url
            callback(null, link)
          })
          .catch(error => {
             logger.error(error)
             callback(new Error(error), null)
             return
          })
      })
      .catch(error => {
       logger.error(error)
        callback(new Error(error), null)
        return
      })
  })
    */
}
