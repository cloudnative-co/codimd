/* eslint-env browser, jquery */
/* global serverurl, moment */

import store from 'store'

import escapeHTML from 'lodash/escape'

import wurl from 'wurl'

import {
  checkNoteIdValid,
  encodeNoteId
} from './utils'

import { checkIfAuth } from './lib/common/login'

import { urlpath } from './lib/config'

export function parseServerToNotes (list, callback) {
    var locale = $('.ui-locale').val()
    moment.locale(locale)

    $.get(`${serverurl}/notes`).done(data => {
        console.log("request notes done");
        var notes = data.notes;
        if (notes) {
            callback(list, [])
        }
        for (let i = 0; i < notes.length; i++) {

            notes[i].text = escapeHTML(notes[i].text)
            const timestamp = moment(notes[i].updated)
            notes[i].timestamp = timestamp.valueOf()
            notes[i].fromNow = timestamp.fromNow()
            notes[i].time = timestamp.format('llll')
            notes[i].created = (moment(notes[i].created)).format('llll')
            if (notes[i].id && list.get('id', notes[i].id).length === 0) {
                list.add(notes[i])
            }
        }
        callback(list, notes)
    }).fail((xhr, status, error) => {
        console.log("request notes error");
        console.error(xhr.responseText)
    })
}

export function getTags (callback) {
    $.get(`${serverurl}/tags`).done(data => {
        if (data.tags) {
            callback(data.tags)
        }
    }).fail((xhr, status, error) => {
        console.log("request notes error");
        console.error(xhr.responseText)
    })
}
