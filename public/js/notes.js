/* eslint-env browser, jquery */
/* global serverurl, moment */
import List from 'list.js'
import unescapeHTML from 'lodash/unescape'
import escapeHTML from 'lodash/escape'
import {
  checkNoteIdValid,
  encodeNoteId
} from './utils'
import {
    checkIfAuth,
    resetCheckAuth
} from './lib/common/login'
import { urlpath } from './lib/config'

/* note item html */
const noteItem = {
    valueNames: ['id', 'text', 'timestamp', 'fromNow', 'time', 'tags', 'owner', 'updated', 'created'],
    item: `<li class="col-xs-12 col-sm-6 col-md-6 col-lg-4">
            <span class="id" style="display:none;"></span>
            <a href="#">
                <div class="item">
                    <div class="content">
                        <h4 class="text"></h4>
                        <p>
                            <i> オーナー <i class="owner"></i></i>
                            <hr>
                                <i><i class="fa fa-clock-o"></i> 最終更新 </i><i class="fromNow"></i>
                            <br>
                            <i><i class="fa fa-clock-o"></i> 作成日時:<i class="created"></i></i>
                            <br>
                            <i><i class="fa fa-clock-o"></i> 更新日時:<i class="time"></i></i>
                        </p>
                        <p class="tags"></p>
                    </div>
                </div>
            </a>
        </li>`,
    page: 18,
    pagination: [{
        outerWindow: 1
    }]
}
/* note List */
const notesList = new List('notes', noteItem)

export function notesInit() {
    parseServerToNotes(notesList, sortNotesByTimestamp)
    /* set tag filter dropdown */
    $('.ui-use-notes-tags').select2({
        placeholder: $('.ui-use-notes-tags').attr('placeholder'),
        multiple: true,
        ajax: {
            url: "/parts/tags",
            type: "GET",
            dataType: 'json',
            quietMillis: 50,
            data: function (term) {
                return {
                    option: term
                };
            },
            results: function (data) {
                return {
                    results: data
                }
            }
        }
    })
    /* set owner filter dropdown */
    $('.ui-use-owners').select2({
        placeholder: $('.ui-use-owners').attr('placeholder'),
        multiple: true,
        ajax: {
            url: "/parts/owners",
            type: "GET",
            dataType: 'json',
            quietMillis: 50,
            data: function (term) {
                return {
                    option: term
                };
            },
            results: function (data) {
                return {
                    results: data
                }
            }
        }
    })
    getTagCloud()
}

function tagClick(e) {
    var jqe = $(e.currentTarget.children[0]);
    var tag = jqe.text();
    $.get(`${serverurl}/parts/tags`).done(items => {
        for (var i in items) {
            var dtag = items[i]
            if (items[i].text == tag){
                $('.ui-use-notes-tags').select2('data', [items[i]])
                changeKeywords()
                break
            }
        }
    })
}
/*
 @brief     show tag cloud
 */
function getTagCloud() {
    var frame = $('#tags_frame')
    frame.empty();
    $.get(`${serverurl}/notes/tags`).done(tags => {
        for (let i = 0; i < tags.length; i++) {
            var frm = $('<div class="tag_frame">');
            var name = $('<div class="tag_name">');
            var mark = $('<div class="tag_count_circle">');
            name.text(unescapeHTML(tags[i].tag));
            mark.text(tags[i].count);
            frm.append(name);
            frm.append(mark);
            frm.click(tagClick);
            frame.append(frm);
        }
    }).fail((xhr, status, error) => {
        console.error(xhr.responseText)
    })
}
/*
 @brief     Get note list from server
 */
function parseServerToNotes (list, callback) {
    $.get(`${serverurl}/notes/list`).done(data => {
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
        // call sortNotesByTimestamp
        callback(list, notes)
    }).fail((xhr, status, error) => {
        console.log("request notes error");
        console.error(xhr.responseText)
    })
}
/*
 @breif     Note list is sorted in the timestamp.
 */
function sortNotesByTimestamp (list, notes) {
    checkNotesList()
    list.sort(
        '', {
            sortFunction (a, b) {
                const notea = a.values()
                const noteb = b.values()
                if (notea.timestamp > noteb.timestamp) {
                    return -1
                } else if (notea.timestamp < noteb.timestamp) {
                    return 1
                } else {
                    return 0
                }
            }
        }
    )
}

function checkNotesList () {
  if ($('#notes-list').children().length > 0) {
    $('.pagination').show()
    $('.ui-nonotes').hide()
  } else if ($('#notes-list').children().length === 0) {
    $('.pagination').hide()
    $('.ui-nonotes').slideDown()
  }
}
/*
 @brief         Filtering processing of a notebook list
 @details       A dictionary is designated as an argument.
                A key word of a dictionary is tags, owner, text.
 @params[in]    keywords(dict)
 @n             keywords.text (list)
 @n             keywords.owner (list)
 @n             keywords.tags (list)
 */
function filteringNoteList(keywords) {
    let length = 0
    for(var key in keywords) {
        length += keywords[key].length
    }
    if (length == 0){
        notesList.filter()
    } else {
        notesList.filter(item => {
            const values = item.values()
            let found = false
            for(var key in keywords) {
                if ( ! values[key]) {
                    continue
                }
                for (let i = 0; i < keywords[key].length; i++) {
                    if ((typeof values) == "string") {
                        if (values[key] == keywords[key][i].text) {
                            found = true
                            break
                        }
                    } else {
                        if (values[key].includes(keywords[key][i].text)) {
                            found = true
                            break
                        }
                    }
                }
            }
            return found
        })
    }
    checkNotesList()
}
/*
 @brief     change filter keywords event
 */
function changeKeywords(){
    const tags = $(".ui-use-notes-tags").select2('data')
    const owner = $(".ui-use-owners").select2('data')
    var title = $(".search_notes").val()
    title = title.trim()
    if (title.length == 0){
        title = []
    } else {
        title = [{text:title}]
    }
    filteringNoteList({
        owner: owner,
        tags:tags,
        text: title
    })
}

/*
 @brief     Note list update event
 */
notesList.on('updated', e => {
    for (let i = 0, l = e.items.length; i < l; i++) {
        const item = e.items[i]
        if (item.visible()) {
            const itemEl = $(item.elm)
            const pin = itemEl.find('.ui-notes-pin')
            const values = item._values
            const a = itemEl.find('a')
            const tagsEl = itemEl.find('.tags')
            a.attr('href', `${serverurl}/${values.id}`)
            const tags = values.tags
            if (tags && tags.length > 0 && tagsEl.children().length <= 0) {
                const labels = []
                for (let j = 0; j < tags.length; j++) {
                    labels.push(`<span class='label label-default'>${tags[j]}</span>`)
                }
                tagsEl.html(labels.join(' '))
            }
        }
    }
})

/*
 @breif     note list refresh button click event
 */
$('.ui-refresh-notes').click(() => {
    resetCheckAuth()
    notesList.clear()
    notesInit()
})
$('.ui-use-notes-tags').on('change', changeKeywords)
$('.ui-use-owners').on('change', changeKeywords)
$('.search_notes').keyup(changeKeywords)
