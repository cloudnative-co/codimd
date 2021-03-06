'use strict'

const Router = require('express').Router
const passport = require('passport')
const SamlStrategy = require('passport-saml').Strategy
const config = require('../../../config')
const models = require('../../../models')
const logger = require('../../../logger')
const audit = require('../../../audit')
const { urlencodedParser } = require('../../utils')
const fs = require('fs')
const intersection = function (array1, array2) { return array1.filter((n) => array2.includes(n)) }

const samlAuth = module.exports = Router()

passport.use(new SamlStrategy({
  callbackUrl: config.serverURL + '/auth/saml/callback',
  entryPoint: config.saml.idpSsoUrl,
  issuer: config.saml.issuer || config.serverURL,
  cert: fs.readFileSync(config.saml.idpCert, 'utf-8'),
  identifierFormat: config.saml.identifierFormat,
  disableRequestedAuthnContext: config.saml.disableRequestedAuthnContext,
  passReqToCallback: true
}, function (req, user, done) {
  // check authorization if needed
  if (config.saml.externalGroups && config.saml.groupAttribute) {
    var externalGroups = intersection(config.saml.externalGroups, user[config.saml.groupAttribute])
    if (externalGroups.length > 0) {
      logger.error('saml permission denied: ' + externalGroups.join(', '))
      return done('Permission denied', null)
    }
  }
  if (config.saml.requiredGroups && config.saml.groupAttribute) {
    if (intersection(config.saml.requiredGroups, user[config.saml.groupAttribute]).length === 0) {
      logger.error('saml permission denied')
      return done('Permission denied', null)
    }
  }
  // user creation
  var uuid = user[config.saml.attribute.id] || user.nameID
  var profile = {
    provider: 'saml',
    id: 'SAML-' + uuid,
    username: user[config.saml.attribute.username] || user.nameID,
    emails: user[config.saml.attribute.email] ? [user[config.saml.attribute.email]] : []
  }
  if (profile.emails.length === 0 && config.saml.identifierFormat === 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress') {
    profile.emails.push(user.nameID)
  }
  var stringifiedProfile = JSON.stringify(profile)
  models.User.findOrCreate({
    where: {
      profileid: profile.id.toString()
    },
    defaults: {
      profile: stringifiedProfile
    }
  }).spread(function (user, created) {
    if (user) {
      var needSave = false
      if (user.profile !== stringifiedProfile) {
        user.profile = stringifiedProfile
        needSave = true
      }
      if (needSave) {
        user.save().then(function () {
          if (config.debug) { logger.debug('user login: ' + user.id) }
            audit.request("LOGIN_AND_CREATE_SAML", req, null, null, user)
          return done(null, user)
        })
      } else {
        if (config.debug) { logger.debug('user login: ' + user.id) }
        audit.request("LOGIN_SAML", req, null, null, user)
        return done(null, user)
      }
    }
  }).catch(function (err) {
    logger.error('saml auth failed: ' + err)
    return done(err, null)
  })
}))

samlAuth.get('/auth/saml', function(req, res, next) {
    passport.authenticate('saml', {
        additionalParams: {'RelayState': req.query.noteid},
        failureRedirect: config.serverURL + '/'
    })(req, res, next)
})

samlAuth.post('/auth/saml/callback', urlencodedParser,
    passport.authenticate('saml', {
        failureRedirect: config.serverURL + '/'
    }), function(req, res) {
        res.redirect(config.serverURL + '/' + req.body.RelayState)
    }
)

samlAuth.get('/auth/saml/metadata', function (req, res) {
  res.type('application/xml')
  res.send(passport._strategy('saml').generateServiceProviderMetadata())
})
