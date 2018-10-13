/*
 * LMS-Material
 *
 * Copyright (c) 2018 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */

const PQ_PLAY_NOW_ACTION =  { title: 'Play now',              cmd: 'playnow',  icon: 'play_circle_outline'   };
const PQ_PLAY_NEXT_ACTION = { title: 'Move to next in queue', cmd: 'playnext', icon: 'play_circle_filled'    };
const PQ_REMOVE_ACTION =    { title: 'Remove from queue',     cmd: 'remove',   icon: 'remove_circle_outline' };

const PQ_SAVE_ACTION  = { id: "pq:save",  title: "Save queue"  };
const PQ_CLEAR_ACTION = { id: "pq:clear", title: "Clear queue" };

function queueItemCover(item) {
    if (item.artwork_url) {
        return resolveImage(null, item.artwork_url);
    }
    if (item.coverid) {
        return lmsServerAddress+"/music/"+item.coverid+"/cover.jpg";
    }
    return "images/nocover.jpg";
}

function parseResp(data) {
    var resp = { timestamp: 0, items: [], size: 0 };
    if (data.result) {
        resp.timestamp = data.result.playlist_timestamp;
        resp.size = data.result.playlist_tracks;
        
        if (data.result.playlist_loop) {
            data.result.playlist_loop.forEach(i => {
                var title = i.title;
                if (i.tracknum>0) {
                     title = (i.tracknum>9 ? i.tracknum : ("0" + i.tracknum))+" "+title;
                }
                var subtitle = i.artist;
                if (i.album) {
                    if (subtitle) {
                        subtitle+=" ("+i.album+")";
                    } else {
                        sbtitle=i.album;
                    }
                }
                var image = queueItemCover(i);
                var isStream = i.url && (i.url.startsWith("http:") || i.url.startsWith("https:"));
                resp.items.push({
                              url: "track_id:"+i.id,
                              title: title,
                              subtitle: subtitle,
                              icon: image ? undefined : (isStream ? "wifi_tethering" : "music_note"),
                              image: image,
                              actions: [PQ_PLAY_NOW_ACTION, PQ_PLAY_NEXT_ACTION, DIVIDER, PQ_REMOVE_ACTION],
                              duration: i.duration
                          });
            });
        }
    }
    return resp;
}

var lmsQueue = Vue.component("LmsQueue", {
  template: `
  <!-- style below is needed so that swipe works on empty area -->
    <div v-touch="{ left: () => swipe('l'), right: () => swipe('r')}" style="width:100%; height:100%"> 
      <v-dialog v-model="dialog.show" persistent max-width="500px">
        <v-card>
          <v-card-text>
            <span v-if="dialog.title">{{dialog.title}}</span>
            <v-container grid-list-md>
              <v-layout wrap>
                <v-flex xs12>
                  <v-text-field :label="dialog.hint" v-model="dialog.value"></v-text-field>
                </v-flex>
              </v-layout>
            </v-container>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn flat @click.native="dialog.show = false; dialogResponse(false);">{{undefined===dialog.cancel ? 'Cancel' : dialog.cancel}}</v-btn>
            <v-btn flat @click.native="dialogResponse(true);">{{undefined===dialog.ok ? 'OK' : dialog.ok}}</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <v-snackbar v-model="snackbar.show" :multi-line="true" :timeout="2500" top>{{ snackbar.msg }}</v-snackbar>
      <v-card class="subtoolbar pq-details">
        <v-layout>
          <v-flex class="pq-text" v-if="playerStatus">{{playerStatus.playlist.count | displayCount}} {{duration | displayTime(true)}}</v-flex>
          <v-spacer></v-spacer>
          <v-btn flat icon @click.stop="scrollToCurrent()" class="toolbar-button"><v-icon>queue_music</v-icon></v-btn>
          <v-btn flat icon @click.stop="save()" class="toolbar-button"><v-icon>save</v-icon></v-btn>
          <v-btn flat icon @click.stop="clear()" class="toolbar-button"><v-icon>clear_all</v-icon></v-btn>
        </v-layout>
      </v-card>
      <div class="subtoolbar-pad"></div>
      <v-list class="lms-list-page">
        <template v-for="(item, index) in items">
          <v-list-tile :key="item.title" avatar v-bind:class="{'pq-current': index==currentIndex}" :id="'track'+index" @dragstart="dragStart(index, $event)"  @dragover="dragOver($event)" @drop="drop(index, $event)" draggable>
            <v-list-tile-avatar v-if="item.image" :tile="true">
              <img v-lazy="item.image">
            </v-list-tile-avatar>
            <v-list-tile-avatar v-else-if="item.icon" :tile="true">
              <v-icon>{{item.icon}}</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-content>
              <v-list-tile-title>{{item.title}}</v-list-tile-title>
              <v-list-tile-sub-title>{{item.subtitle}}</v-list-tile-sub-title>
            </v-list-tile-content>
            <v-list-tile-action v-if="item.duration>0" class="pq-time">{{item.duration | displayTime}}</v-list-tile-action>
            <v-list-tile-action v-if="item.actions && item.actions.length>1" @click.stop=""> <!-- @click.stop stops even going to list item (navigate) -->
              <v-menu offset-y>
                <v-btn icon ripple slot="activator">
                  <v-icon>more_vert</v-icon>
                </v-btn>
                <v-list>
                  <template v-for="(action, actIndex) in item.actions">
                    <v-divider v-if="action.divider"></v-divider>
                    <v-list-tile v-else @click="itemAction(action.cmd, item, index)">
                      <v-list-tile-title><v-icon>{{action.icon}}</v-icon>&nbsp;&nbsp;{{action.title}}</v-list-tile-title>
                    </v-list-tile>
                   </template>
                </v-list>
              </v-menu>
            </v-list-tile-action>
          </v-list-tile>
          <v-divider v-if="(index+1 < items.length) && (index!==currentIndex && (index+1)!==currentIndex)"></v-divider>
        </template>
      </v-list>
    </div>
`,
    props: [],
    data() {
        return {
            items: [],
            currentIndex: -1,
            snackbar:{ show: false, msg: undefined},
            dialog: { show:false, title:undefined, hint:undefined, ok: undefined, cancel:undefined},
            duration: 0.0
        }
    },
    created() {
        this.fetchingItems = false;
        this.timestamp = 0;
        this.currentIndex = -1;
        this.items = [];
        this.isVisible = true;
        this.autoScrollRequired = false;
    },
    mounted() {
        this.scroll();

        this.listSize = this.items.length;
        bus.$on('playerChanged', function() {
	        this.items=[];
	        this.timestamp=0;
        }.bind(this));

        bus.$on('playListDetails', function(currentIndex, timestamp) {
            if (timestamp!==this.timestamp) {
                this.timestamp = timestamp;
                this.scheduleUpdate();
            } else if (currentIndex!==this.currentIndex) {
                this.currentIndex = currentIndex;
                if (this.$store.state.autoScrollQueue) {
                    this.scrollToCurrent();
                }
            }
        }.bind(this));

        // As we scroll the whole page, we need to remember the current position when changing to (e.g.) browse
        // page, so that it can be restored when going back here.
        bus.$on('routeChange', function(from, to, pos) {
            this.isVisible = '/queue'==to;
            if (this.isVisible) {
                if (this.$store.state.autoScrollQueue && this.autoScrollRequired==true) {
                    this.$nextTick(function () {
                        this.scrollToCurrent();
                    });
                } else if (this.previousScrollPos!==undefined) {
                    this.$nextTick(function () {
                        document.documentElement.scrollTop=this.previousScrollPos>0 ? this.previousScrollPos : 0;
                    });
                }
            } else if (from=='/queue') {
                this.previousScrollPos = pos;
            }
        }.bind(this));
    },
    methods: {
        save() {
            if (this.items.length<1) {
                return;
            }
            this.dialog={show: true, title: "Save play queue", hint: "Name", ok: "Save", value: undefined };
        },
        clear() {
            if (this.items.length<1) {
                return;
            }
            this.$confirm("Remove all tracks from queue?",
                          {buttonTrueText: 'Clear', buttonFalseText: 'Cancel'}).then(res => {
                if (res) {
                    bus.$emit('playerCommand', ["playlist", "clear"]);
                }
            });
        },
        dialogResponse(val) {
            if (val && this.dialog.value) {
                var name = this.dialog.value.trim();
                if (name.length>1) {
                    this.dialog.show = false;
                    lmsCommand(this.$store.state.player.id, ["playlist", "save", name]).then(({datax}) => {
                    }).catch(err => {
                        this.snackbar={ msg:"Failed to save play queue", show: true};
                    });
                }
            }
        },
        itemAction(act, item, index) {
            if (PQ_PLAY_NOW_ACTION.cmd===act) {
                bus.$emit('playerCommand', ["playlist", "index", index]);
            } else if (PQ_PLAY_NEXT_ACTION.cmd===act) {
                if (index!==this.currentIndex) {
                    bus.$emit('playerCommand', ["playlist", "move", index, this.currentIndex+1]);
                }
            } else if (PQ_REMOVE_ACTION.cmd===act) {
                bus.$emit('playerCommand', ["playlist", "delete", index]);
            }
        },
        getDuration() {
            if (this.items.length>0) {
                // Get total duration of queue
                lmsCommand(this.$store.state.player.id, ["status", "-", 1, "tags:DD"]).then(({data}) => {
                    this.duration = data.result && data.result["playlist duration"] ? data.result["playlist duration"] : 0.0;
                });
            } else {
                this.duration = 0.0;
            }
        },
        fetchItems() {
            this.fetchingItems = true;
            var prevTimestamp = this.timestamp;
            lmsList(this.$store.state.player.id, ["status"], ["tags:adcltuK"], this.items.length).then(({data}) => {
                var resp = parseResp(data);
                if (this.items.length && resp.items.length) {
                    resp.items.forEach(i => {
                        this.items.push(i);
                    });
                } else {
                    this.items = resp.items;
                }
                // Check if a 'playlistTimestamp' was received whilst we were updating, if so need
                // to update!
                var needUpdate = this.timestamp!==prevTimestamp && this.timestamp!==timestamp;
                this.timestamp = resp.timestamp;
                this.listSize = resp.size;
                this.fetchingItems = false;
                if (needUpdate) {
                    this.scheduleUpdate();
                } else {
                    this.getDuration();
                    if (this.$store.state.autoScrollQueue) {
                        this.$nextTick(function () {
                            this.scrollToCurrent();
                        });
                    }
                }
            }).catch(err => {
                this.fetchingItems = false;
            });
        },
        scheduleUpdate() {
            // Debounce updates, incase we have lots of changes together
            if (this.updateTimer) {
                clearTimeout(this.updateTimer);
            }
            this.updateTimer = setTimeout(function () {
                this.updateItems();
            }.bind(this), 50);
        },
        updateItems() {
            if (this.fetchingItems) {
                return;
            }
            if (this.items.length===0) {
                this.fetchItems();
            } else {
                var currentPos = document.documentElement.scrollTop;
                this.fetchingItems = true;

                lmsList(this.$store.state.player.id, ["status"], ["tags:adcltuK"], 0, this.items.length < 50 ? 50 : this.items.length).then(({data}) => {
                    var resp = parseResp(data);
                    this.items = resp.items;
                    this.timestamp = resp.timestamp;
                    this.fetchingItems = false;
                    this.getDuration();
                    this.$nextTick(function () {
                        document.documentElement.scrollTop=currentPos>0 ? currentPos : 0;
                    });
                }).catch(err => {
                    this.fetchingItems = false;
                });
            }
        },
        scroll () { // Infinite scroll...
            window.onscroll = () => {
                if (this.fetchingItems || this.listSize<=this.items.length) {
                    return;
                }
                let bottomOfWindow = (document.documentElement.scrollTop + window.innerHeight) >= (document.documentElement.offsetHeight-300);

                if (bottomOfWindow) {
                    this.fetchItems();
                }
            };
        },
        scrollToCurrent() {
            this.autoScrollRequired = false;
            if (this.items.length>5 && this.currentIndex<=this.items.length) {
                if (this.isVisible) { // Only scroll page if visible - otherwise we'd scroll the brows/nowplaying page!
                    // Offset of -68 below to take into account toolbar
                    this.$vuetify.goTo('#track'+(this.currentIndex>3 ? this.currentIndex-3 : 0), {offset: -68, duration: 500});
                } else {
                    this.autoScrollRequired = true;
                }
            }
        },
        dragStart(which, ev) {
            ev.dataTransfer.dropEffect = 'move';
            ev.dataTransfer.setData('Text', this.id);
            this.dragIndex = which;
            this.stopScrolling = false;
        },
        dragOver(ev) {
            // Drag over item at top/bottom of list to start scrolling
            this.stopScrolling = true;
            if (ev.clientY < 110) {
                this.stopScrolling = false;
                this.scrollList(-5)
            }

            if (ev.clientY > (window.innerHeight - 70)) {
                this.stopScrolling = false;
                this.scrollList(5)
            }
            ev.preventDefault(); // Otherwise drop is never called!
        },
        scrollList(step) {
            var scrollY = document.documentElement.scrollTop;
            document.documentElement.scrollTop = scrollY + step;
            if (!this.stopScrolling) {
                setTimeout(function () {
                    this.scrollList(step);
                }.bind(this), 100);
            }
        },
        drop(to, ev) {
            this.stopScrolling = true;
            ev.preventDefault();
            if (this.dragIndex!=undefined && to!=this.dragIndex) {
                bus.$emit('playerCommand', ["playlist", "move", this.dragIndex, to]);
            }
            this.dragIndex = undefined;
        },
        swipe(direction) {
            if ('l'==direction) {
                this.$router.push('/browse');
            } else if ('r'==direction) {
                this.$router.push('/nowplaying');
            }
        }
    },
    computed: {
        playerStatus() {
            return this.$store.state.playerStatus
        }
    },
    filters: {
        displayTime: function (value, bracket) {
            if (!value) {
                return '';
            }
            if (bracket) {
                if (value<0.000000000001) {
                    return '';
                }
                return " (" + formatSeconds(Math.floor(value)) + ")";
            }
            return formatSeconds(Math.floor(value));
        },
        displayCount: function (value) {
            if (!value) {
                return '';
            }
            return 1===value ? "1 Track" : (value+" Tracks");
        }
    },
    beforeDestroy() {
        if (undefined!==this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = undefined;
        }
    }
});
