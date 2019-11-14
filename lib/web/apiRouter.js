'use strict'

const Router = require('express').Router
const passport = require('passport')
const passportJwt = require('passport-jwt');
const JwtStrategy = require('passport-jwt').Strategy;
//const ExtractJwt = require('passport-jwt').ExtractJwt;
// const bodyParser = require( 'body-parser');
const jwt = require( 'jsonwebtoken' );
const response = require('../response')
const models = require('../models')
const config = require('../config')
const logger = require('../logger')
const util = require("util")

const { urlencodedParser } = require('./utils')

const apiRouter = module.exports = Router()
const jwtOptions = {
    jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.jwt.secret,
}


function getUserId(profileid) {
}

passport.use(new JwtStrategy(jwtOptions, (jwt_payload, done) => {
    var id = jwt_payload.id
    var name = jwt_payload.name
    return done(null, name);
}));

/**
 @brief     JWT用オーセンティケート
 */
apiRouter.get('/api/authenticate', (req, res) => {
    if (! req.isAuthenticated()) {
        res.status(401).send({
            status: 'forbidden'
        })
    }
     models.User.findOne({where: {id: req.user.id}}).then(user => {
        if (!user) { return }
            var profile = models.User.getProfile(user)
            return profile
    }).then(profile => {
        const payload = {
            id: profile.id,
            name: profile.name
        };
        var token = jwt.sign(
            payload,
            config.jwt.secret,
        )
        res.json({
            success: true,
            message: 'Authentication successfully finished.',
            token: token
        });
    })
})
/*
 @brief         ノートの新規作成
 @params[in]    user    emailアドレスにてSAMLユーザーの指定
 @params[in]    title   ノートのタイトル
 @params[in]    tag     ノートのタグ指定
 */
apiRouter.get('/api/notes/new', passport.authenticate('jwt', { session: false }), (req, res) => {
    var user = req.query.user;
    var title = req.query.title;
    var tags = req.query.tag;
    if ( !Array.isArray(tags)) {
        tags = [tags]
    }
    Promise.resolve().then(() =>{
        // ユーザーを検索
        if (user) {
            return models.User.findOne({
                where: {
                    profileid: "SAML-" + user
                }
            }).then(record => {
                if (record){
                    return record.id
                } else {
                    return null
                }
            })
        } else {
            return null
        }
    }).then(ownerId => {
        // メタデータを処理
        var metadata = ["---"]
        var yamlTags = []
        if (tags){
            if (user) {
                tags.unshift(user)
            }
            for (var idx in tags){
                yamlTags.push(tags[idx])
            }
            metadata.push("tags: " + yamlTags.join(', '))
        } else {
            if (user) {
                yamlTags.push(user)
            }
            metadata.push("tags: " + yamlTags.join(', '))
        }
        if (title){
            metadata.push("title: " + title)
        }
        if (title){
//            metadata.push("---", "", title, "===")
            metadata.push("---")
        }
        var yMetadata = metadata.join("\n")
        return {
            title: title,
            metadata: yMetadata,
            ownerId: ownerId
        }
    }).then(data => {
        // ノートを作成
        return models.Note.create({
            ownerId: data.ownerId,
            alias: null,
            content: data.metadata,
            title: data.title
        })
    }).then(note => {
        // レスポンスを返却
        var id = models.Note.encodeNoteId(note.id)
        res.json({
            success: true,
            id: id,
            url: "https://" + config.domain + '/' + id
        })
    }).catch( err => {
        logger.error(err)
    })
})
