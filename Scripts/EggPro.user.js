// ==UserScript==
// @name         EggPro
// @version      1.12
// @description  Tweaks for Egg Ball
// @author       frankieg33
// @include      https://*.koalabeast.com/game
// @include      https://*.koalabeast.com/game?*
// @include      https://koalabeast.com/game
// @include      https://koalabeast.com/game?*
// @include      https://*.koalabeast.com:*
// @include      http://*.jukejuice.com:*
// @include      http://*.newcompte.fr:*
// @include      https://bash-tp.github.io/tagpro-vcr/game*.html
// @updateURL    https://gist.github.com/frankieg33/ee459e2707b44f33db8b6035a6c91292/raw/EggPro.user.js
// @downloadURL  https://gist.github.com/frankieg33/ee459e2707b44f33db8b6035a6c91292/raw/EggPro.user.js
// ==/UserScript==

//--------------CHANGELOG--------------
/*
~~~Version 1.12 (March 4, 2026)~~~
Changed how the script functions to restore functionality, primarily to the pixel perfect ball. All changes were made by Codex, so revert to 1.11 if issues occur.

~~~Version 1.11 (March 2, 2026)~~~
Script was broken, so I updated 'PIXI.Sprite.from' and 'stage.interactive' to get the script working again.
Froked from catalyst518 here - https://gist.github.com/catalyst518/f28accf3d14385470a330ab80c768ee1

Also added the bash-tp version of tagpro-vcr to automatically record games to be watched later.
https://github.com/bash-tp/tagpro-vcr

Note: All new features are opt-in and will continue to be so in any future updates. This means your settings will be reset to their defaults upon updating.
~~~Version 1.10 (July 21, 2021)~~~

Added option to flash the ball of the player who threw the egg until they are safe from a turnover pop.
Fixed map name

Added default settings:
flash_passer=false;

~~~Version 1.9 (February 23, 2021)~~~

Added option to have a passing sound play whenever anyone passes the egg.
Added option to have the egg change colors to indicate raptor (green egg) and interception status (orange egg).
Added default enabled option to show your team's current score differential.
Added default enabled option to show a text alert when a raptor boat occurs.

Added default settings:
pass_sound=false;
egg_timer=false;
score_difference=true;
boat_notice=true;

~~~Version 1.8 (January 29, 2021)~~~

Added option to use a custom texture pack. Note this will affect your texture pack in normal games of TagPro as well.

Added default settings:
custom_texture=false;
texture_url="https://i.imgur.com/mpdNY1g.png";

~~~Version 1.7 (July 7, 2020)~~~

Added default enabled option to shoot when aiming and clicking outside of the field area.
Added option to shoot on mouse click down without needing to release the mouse button.
Other mouse buttons besides left click no longer trigger shooting or autoshoot, if applicable.
Fixed bug that was preventing some autoshoots when using both auto_key and auto_mouse at the same time.

Added default settings:
extend_click=true;
half_click=false;

~~~Version 1.6 (June 22, 2020)~~~

Added option to disable raptor images. Thanks nabby!

Added default setting:
hide_raptors=false;

~~~Version 1.5 (April 23, 2020)~~~

Updated game url.
Added option to use mouse click as autoshoot trigger.

Added default setting:
auto_mouse=false;

~~~Version 1.4 (July 12, 2019)~~~

Added support for new SWJ servers.
Added option to highlight your own ball.
Added option to lock the camera to your ball, just like in regular TagPro. The script used to do this automatically until something changed in the game code.
     Now you can play either way, but the default is the old script behavior of locked to ball.
Fixed the aiming line to work with the current version of the game/servers.
Fixed the autoshoot aim to work with the current version of the game/servers.
Adjusted the autoshoot rate limiter so you won't get kicked from games for painting the wall. This might need further adjustments.
Added some checks to disable the effects of this script in regular TagPro games.
Updated the default imgur urls to use https instead of http so TagPro maintains a secure connection.

Added default settings:
highlight=false
highlight_url="https://i.imgur.com/h23oRYI.png"
lock_ball=true

~~~Version 1.3 (June 19, 2017)~~~

Added ability to autoshoot when picking up the egg. Activated by holding Left Shift by default (reassign the key in settings).
Added custom crosshair support.
Added aiming line.

Added default settings:
auto_shoot=false
custom_crosshair=false
aim_line=false
crosshair_url="http://i.imgur.com/Pjxxh20.png"
auto_key=16
aim_line_color=0xFF00FF
aim_line_alpha=1

*/
//-----------END OF CHANGELOG-----------


//--------------SETTINGS--------------
//Put a pink ring around your ball so it doesn't get lost in the chaos.
var highlight=false;

//Lock the camera to your ball like in regular tagpro. In eggball, the camera is by default vertically locked to the field giving an out-of-ball sensation.
var lock_ball=true;

//Set the value to false to expand viewport while playing. Set the value to true to expand only when spectating.
var spec_only=false;

//Set true/false to toggle auto-zoom level when spectating.
var auto_zoom=true;

//Set the value to true to use a pixel perfect egg. Set to false to use the vanilla egg.
var pp_egg=true;

//Set the value to true to use the custom, improved map. Set to false to use the vanilla map.
var imp_map=true;

//Set the value to true to enable autoshooting when picking up the egg. Set to false to disable.
var auto_shoot=true;

//Set the value to true to use a custom crosshair. Set to false to use the default crosshair.
var custom_crosshair=true;

//Set the value to true to enable an aiming line to your cursor position. Set to false to disable.
var aim_line=true;

//Set url of custom egg image (23x23 for pixel perfect). Only applies if pp_egg=true.
var egg_url="https://i.imgur.com/B1F1BI5.png";

//Set url of custom egg team indicator image (29x29). Only applies if pp_egg=true.
var egg_team_url="https://i.imgur.com/P0l0yVA.png";

//Set url of custom field image. Only applies if imp_map=true.
var field_url="https://i.imgur.com/vF0f6g0.png";

//Set url of custom crosshair image (designed for 32x32). Only applies if custom_crosshair=true.
var crosshair_url="https://i.imgur.com/Pjxxh20.png";

//Set url of the highlight ring around your ball. Only applies if highlight=true.
var highlight_url="https://i.imgur.com/h23oRYI.png"

//Set autoshoot key. Default is Left Shift (16). Only applies if auto_shoot=true.
//Use this app to get the correct keycode: https://codepen.io/chriscoyier/full/mPgoYJ/ or see https://msdn.microsoft.com/en-us/library/aa243025(v=vs.60).aspx
var auto_key=16;

//Change to true to enable holding mouse click down as the autoshoot trigger. No effects to usual shooting with mouse. Only applies if auto_shoot=true.
var auto_mouse=true;

//Set the color of the aiming line in hex with 0x prefix. Default is 0xFF00FF (matches the custom crosshair). Only applies if aim_line=true.
var aim_line_color=0xFF00FF;

//Set the transparency of the aiming line. Ranges from 0 (transparent) to 1 (opaque). Only applies if aim_line=true.
var aim_line_alpha=0.15;

//Prevent raptors images from scrolling across the screen. Set to true to hide them.
var hide_raptors=false;

//Set to true to pass the egg on mouse click down, without needing to release the click up. Note, setting this to true will also enable the same behavior of extend_click=true.
var half_click=true;

//Set to true to allow aiming and shooting by clicking anywhere outside of the field area.
var extend_click=true;

//Set to true to use a custom texture pack. Note this will affect your texture pack in normal games of TagPro as well. Set to false to use the vanilla egg ball texture pack.
var custom_texture=false;

//Set url of custom texture pack tiles image. Only applies if custom_texture=true.
var texture_url="https://i.imgur.com/mpdNY1g.png";

//Set to true to have a passing sound play whenever anyone passes the egg.
var pass_sound=true;

//Set to true to have the egg change colors to indicate raptor (green egg) and interception status (orange egg).
var egg_timer=true;

//Set to true to show your team's current score differential.
var score_difference=true;

//Set to true to show a text alert when a raptor boat occurs.
var boat_notice=true;

//Set to true to flash the ball of the player who threw the egg until they are safe from a turnover pop.
var flash_passer=false;
//-----------END OF SETTINGS-----------


var oldh=0;
var oldw=0;
var tileSize = 40;
var tileHalf = tileSize / 2;
var playerCameraOffset = tileHalf - 1;
var heldEggSize = 23;
var heldEggOffset = (tileSize - heldEggSize) / 2;
var eggball=false;
var eggHolderId = null;
var lastHolder=null;
var flashInterval=null;
var flashTimeout=null;
if(custom_texture){
    var assetId = generateId();
    var image = new Image();
    image.crossOrigin = true;
    image.src = texture_url;
    image.id = assetId;
    image.className = "asset";
    overrideableAssets["tiles"] = "img#" + assetId;
    console.log(assetId);
    console.log("ASSET");
    $(document).ready(function () {
        $("#assets").append(image);
    });
}

function flashPlayer(){
    lastHolder.sprite.alpha=lastHolder.sprite.alpha==1 ? .5: 1;
}

function normalizeHolderId(raw) {
    if (raw === null || raw === undefined) {
        return null;
    }
    if (typeof raw === "string" || typeof raw === "number") {
        return raw;
    }
    if (typeof raw === "object") {
        if (raw.id !== undefined && raw.id !== null) {
            return raw.id;
        }
        if (raw.playerId !== undefined && raw.playerId !== null) {
            return raw.playerId;
        }
        if (raw.holder !== undefined && raw.holder !== null) {
            return raw.holder;
        }
    }
    return null;
}

function getHolderIdFromEggBallData(data) {
    var candidates = [
        data && data.holder,
        data && data.holderId,
        data && data.player,
        data && data.playerId,
        data && data.id,
        data && data.carrier,
        data && data.ballHolder
    ];
    for (var i = 0; i < candidates.length; i++) {
        var normalized = normalizeHolderId(candidates[i]);
        if (normalized !== null) {
            return normalized;
        }
    }
    return null;
}

tagpro.ready(function() {
    tagpro.socket.on('map', function(data) {
        if (data.info.name=="eggball"){
            eggball=true;
            if(custom_crosshair) {
                $("<style type='text/css'>canvas{cursor: url("+crosshair_url+") 16 16, crosshair !important;}</style>").appendTo("head");
            }
        }
    });

    tagpro.socket.on("eggBall", function(data) {
        gameState = data.state;
        eggHolderId = getHolderIdFromEggBallData(data);
        eggHolder = eggHolderId === null ? null : tagpro.players[eggHolderId];
        if(auto_shoot && (autom ||autokey) && eggHolderId == tagpro.playerId){
            autoShoot();
        }
        if (eggHolderId === null && gameState==="play"){
            if (pass_sound && lastHolder!==tagpro.players[tagpro.playerId]){
                tagpro.playSound("throw", 1);
            }
            if (flash_passer && lastHolder){
                flashInterval=setInterval(flashPlayer,100);
                flashTimeout=setTimeout(function(){
                    lastHolder.sprite.alpha=1;
                    clearInterval(flashInterval);
                },3000);
            }
        }
        else{
            if (flashInterval){
                clearInterval(flashInterval);
            }
            if (lastHolder){
                lastHolder.sprite.alpha=1;
            }
            if (flashTimeout){
                 clearTimeout(flashTimeout);
            }
            lastHolder=eggHolder;
        }
        updateTeamWithEgg();
        eggball=true;
    });

    tagpro.socket.on('score', function(data) {
        if (score_difference && eggball){
            updateScoreDifference(data);
        }
        if (flashInterval){
            clearInterval(flashInterval);
        }
    });

    $('#switchButton').on('click', function() {
        if (score_difference && eggball){
            setTimeout(function() {
                updateScoreDifference({r:tagpro.score.r, b:tagpro.score.b});
            }, 1000);
        }
    });

    if (score_difference && eggball){
        updateScoreDifference({r:tagpro.score.r, b:tagpro.score.b});
    }

    tagpro.socket.on('boat', function(data) {
        if (boat_notice){
            boatScore();
        }
    });

    var stage = tagpro.renderer.stage;
    var container = tagpro.renderer.gameContainer;
    var MousePos = { x: 0, y: 0 };
    var autom=false;
    var autokey=false;
    stage.eventMode = 'dynamic';
    document.addEventListener('mousemove', function(e) {
        MousePos.x = e.clientX;
        MousePos.y = e.clientY;
  });

    onmousemove=function(e){
        if(!tagpro.spectator && aim_line && eggball){
            var player = tagpro.players[tagpro.playerId];
            try {
                player.sprites.aim.clear();
                player.sprites.aim.lineStyle(2, aim_line_color, aim_line_alpha);
                player.sprites.aim.moveTo(tileHalf, tileHalf);
                if (spec_only){
                    player.sprites.aim.lineTo((e.clientX-window.innerWidth/2)*1280/$('#viewport').width()+tileHalf, (e.clientY-window.innerHeight/2)*800/$('#viewport').height()+tileHalf);
                }
                else {
                    player.sprites.aim.lineTo((e.clientX-window.innerWidth/2)+tileHalf, (e.clientY-window.innerHeight/2)+tileHalf);
                }
            }
            catch (err){
                player.sprites.aim = new PIXI.Graphics();
                player.sprites.ball.addChild(player.sprites.aim);
            }
        }
    };

    if (lock_ball){
        tagpro.renderer.updateCameraPosition = function (player) {
            if (player.sprite.x !== -1000 && player.sprite.y !== -1000) {
                tagpro.renderer.centerContainerToPoint(player.sprite.x + playerCameraOffset, player.sprite.y + playerCameraOffset);
            }
        };
    }

    document.onkeydown = function(e){
        if(e.keyCode===auto_key){
            autokey=true;
        }
    };
    document.onkeyup = function(e){
        if(e.keyCode===auto_key){
            autokey=false;
        }
    };

    document.onmousedown = function(e){
        if(half_click && e.button==0){
            var clickPos = {
                x: (MousePos.x * (1 / container.scale.x)) - (container.position.x * (1 / container.scale.x)),
                y: (MousePos.y * (1 / container.scale.y)) - (container.position.y * (1 / container.scale.y))
            };
            tagpro.socket.emit("click", clickPos);
        }
        if(auto_mouse && e.button==0){
            autom=true;
        }
    };
    document.onmouseup = function(e){
        if(auto_mouse && e.button==0){
            autom=false;
        }
    };

    document.onclick=function(e){
        if(extend_click && e.button==0){
            var clickPos = {
                x: (MousePos.x * (1 / container.scale.x)) - (container.position.x * (1 / container.scale.x)),
                y: (MousePos.y * (1 / container.scale.y)) - (container.position.y * (1 / container.scale.y))
            };
            tagpro.socket.emit("click", clickPos);
        }
    };

    var gameState = null;
    var eggHolder = null;
    var realUpdatePlayerPowerUps = tagpro.renderer.updatePlayerPowerUps;

    function getPlayerId(player) {
        if (!player) {
            return null;
        }
        if (player.id !== undefined && player.id !== null) {
            return player.id;
        }
        if (player.playerId !== undefined && player.playerId !== null) {
            return player.playerId;
        }
        for (var id in tagpro.players) {
            if (tagpro.players[id] === player) {
                return id;
            }
        }
        return null;
    }

    function setNativeEggAlpha(player, alpha) {
        if (!player || !player.sprites) {
            return;
        }
        var possibleKeys = ["egg", "eggball", "eggBall", "hourglass", "powerup", "powerups", "powerUps"];
        for (var i = 0; i < possibleKeys.length; i++) {
            var sprite = player.sprites[possibleKeys[i]];
            if (sprite) {
                sprite.alpha = alpha;
            }
        }
        for (var key in player.sprites) {
            if (!Object.prototype.hasOwnProperty.call(player.sprites, key) || key === "egg2") {
                continue;
            }
            var keyLc = key.toLowerCase();
            if (keyLc.indexOf("egg") === -1 && keyLc.indexOf("hour") === -1 && keyLc.indexOf("powerup") === -1) {
                continue;
            }
            var spriteByKey = player.sprites[key];
            if (spriteByKey && spriteByKey.alpha !== undefined) {
                spriteByKey.alpha = alpha;
            }
        }
        var possibleContainers = ["powerup", "powerups", "powerUps"];
        for (var j = 0; j < possibleContainers.length; j++) {
            var container = player.sprites[possibleContainers[j]];
            if (container && container.children) {
                for (var k = 0; k < container.children.length; k++) {
                    container.children[k].alpha = alpha;
                }
            }
        }
    }

    function ensureHeldEggSprite(player) {
        if (!player.sprites.egg2) {
            player.sprites.egg2 = PIXI.Sprite.from(egg_url);
            player.sprites.egg2.width = heldEggSize;
            player.sprites.egg2.height = heldEggSize;
            player.sprites.egg2.x = heldEggOffset;
            player.sprites.egg2.y = heldEggOffset;
            if (player.sprites.ball) {
                player.sprites.ball.addChild(player.sprites.egg2);
            }
            else {
                player.sprite.addChild(player.sprites.egg2);
            }
        }
        return player.sprites.egg2;
    }

    function playerIsEggHolder(player) {
        var playerId = getPlayerId(player);
        if (eggHolderId !== null && playerId !== null && String(playerId) === String(eggHolderId)) {
            return true;
        }
        if (eggHolder) {
            var holderId = getPlayerId(eggHolder);
            if (holderId !== null && playerId !== null && String(playerId) === String(holderId)) {
                return true;
            }
            if (eggHolder === player) {
                return true;
            }
        }
        return false;
    }

    function syncHeldEggForPlayer(player) {
        if (!player || !player.sprites) {
            return;
        }
        if (pp_egg && eggball) {
            var isHolder = playerIsEggHolder(player);
            var heldEgg = ensureHeldEggSprite(player);
            heldEgg.alpha = isHolder ? 1 : 0;
            setNativeEggAlpha(player, isHolder ? 0 : 1);
            return;
        }
        if (player.sprites.egg2) {
            player.sprites.egg2.alpha = 0;
        }
        setNativeEggAlpha(player, 1);
    }

    if (imp_map){
        tagpro.renderer.afterDrawBackground = function() {
            if(eggball){
                const fieldSprite = PIXI.Sprite.from(field_url);
                fieldSprite.x = tileSize;
                fieldSprite.y = tileSize;
                tagpro.renderer.layers.foreground.addChildAt(fieldSprite, 0);}
        };
    }

    try{
        tagpro.renderer.updatePlayerPowerUps = function (player, context, drawPos) {
            realUpdatePlayerPowerUps(player, context, drawPos);
            syncHeldEggForPlayer(player);
        };}
    catch(err){
        //Not egg mode
    }
    var eggTeam = PIXI.Sprite.from("events/easter-2016/images/egg.png");
    if (pp_egg){
        eggTeam = PIXI.Sprite.from(egg_team_url);}
    eggTeam.width = 29;
    eggTeam.height = 29;
    eggTeam.anchor.x = 0.5;
    eggTeam.anchor.y = 0.5;
    eggTeam.alpha = 0.75;
    eggTeam.visible = false;
    try{
        tagpro.renderer.layers.ui.addChildAt(eggTeam,1);
        tagpro.renderer.layers.ui.removeChildAt(0);}
    catch(err){
        //Not egg mode
    }

    var rate=true;
    function autoShoot(){
        if (!rate) return;
        rate=false;
        var clickPos = {
            x: (MousePos.x * (1 / container.scale.x)) - (container.position.x * (1 / container.scale.x)),
            y: (MousePos.y * (1 / container.scale.y)) - (container.position.y * (1 / container.scale.y))
        };
        tagpro.socket.emit("click", clickPos);
        setTimeout(function(){rate = true;}, 15);//needed to avoid kick for too many server requests
    }

    function updateTeamWithEgg() {
        if (!tagpro.ui.sprites["yellowFlagTakenByRed"]) {
            return setTimeout(updateTeamWithEgg.bind(this), 50);
        }
        if (!eggHolder) {
            eggTeam.visible = false;
        }
        else {
            eggTeam.visible = true;
            if (eggHolder.team === 1) {
                const pos = tagpro.ui.sprites["yellowFlagTakenByRed"];
                eggTeam.x = pos.x;
                eggTeam.y = pos.y;
            }
            else {
                const pos = tagpro.ui.sprites["yellowFlagTakenByBlue"];
                eggTeam.x = pos.x;
                eggTeam.y = pos.y;
            }
        }
    }

    var oldUpdateMarsball = tagpro.renderer.updateMarsBall.bind(tagpro.updateMarsBall);
    var oldDrawMarsball = tagpro.renderer.drawMarsball.bind(tagpro.renderer);

    tagpro.renderer.updateMarsBall = function(object, position) {
        if (object.type == "egg") {
            position.x = position.x + tileHalf;
            position.y = position.y + tileHalf;
        }

        oldUpdateMarsball(object, position);
    };

    tagpro.renderer.drawMarsball = function (object, position) {
        if (object.type == "marsball") {
            return oldDrawMarsball(object, position);
        }
        if (object.type !== "egg") {
            return;
        }
        if (tagpro.spectator) {
            object.draw = true;
        }
        if (pp_egg){
            object.sprite = PIXI.Sprite.from(egg_url);}
        else {
            object.sprite = PIXI.Sprite.from("events/easter-2016/images/egg.png");}
        object.sprite.position.x = position.x;
        object.sprite.position.y = position.y;
        object.sprite.width = heldEggSize;
        object.sprite.height = heldEggSize;
        if (egg_timer) {
            object.sprite.tint = 0x00FF63;
            setTimeout(function () {
                object.sprite.tint = 0xA654CC;
            }, 1500);
            setTimeout(function () {
                object.sprite.tint = 0xFFFFFF;
            }, 3000);
        }
        object.sprite.pivot.set(heldEggSize * 0.5, heldEggSize * 0.5);
        tagpro.renderer.layers.foreground.addChild(object.sprite);
        object.sprite.keep = true;
        if (!object.draw) {
            object.sprite.visible = false;
        }
    };

    //Thanks to /u/nabbynz for this code block to hide the raptors!
    if (hide_raptors) {
        for (let i=0; i<tagpro.renderer.layers.ui.children.length; i++) {
            if (tagpro.renderer.layers.ui.children[i].texture.baseTexture.imageUrl.includes('raptor')) { //e.g.: events/easter-2017/images/raptor13.png
                console.log('Hiding Raptor:', tagpro.renderer.layers.ui.children[i].texture.baseTexture.imageUrl);
                tagpro.renderer.layers.ui.children[i].renderable = false;
            }
        }
    }

    var defaultUpdatePlayerSpritePosition = tagpro.renderer.updatePlayerSpritePosition;
    tagpro.renderer.updatePlayerSpritePosition = function (player) {
        // Create highlight
        if (eggball && !tagpro.spectator && highlight && player==tagpro.players[tagpro.playerId] && !player.sprites.highlight) {
            player.sprites.highlight = PIXI.Sprite.from(highlight_url);
            player.sprites.highlight.x = -5;
            player.sprites.highlight.y = -5;
            player.sprites.ball.addChild(player.sprites.highlight);
        }
        defaultUpdatePlayerSpritePosition(player);
        syncHeldEggForPlayer(player);
    };

    function waitForId() {
        if (!tagpro.playerId) {
            return setTimeout(waitForId, 100);
        }
        if((tagpro.spectator || !spec_only) && eggball)
        {
            //Resize viewport
            resize();
            if(tagpro.spectator){
                tagpro.viewport.followPlayer=false;
            }
            //Check for resizing and update FOV and zoom accordingly
            setInterval(updateFOV, 500);
        }
    }
    waitForId();
});

//Thanks to /u/nabbynz for this code block adapted from his script TagPro Map Name Below Timer (& More!)
var updateScoreDifference = function(data) {
     let diffText = '=';
     let color = '#ffff40';

     if (data.r - data.b > 0) {
         if (tagpro.playerId && tagpro.players[tagpro.playerId].team === 1) {
             diffText = '+' + Math.abs(data.r - data.b);
             color = '#00CC00';
         } else {
             diffText = '-' + Math.abs(data.r - data.b);
             color = '#CC0000';
         }
     } else if (data.r - data.b < 0) {
         if (tagpro.playerId && tagpro.players[tagpro.playerId].team === 1) {
             diffText = '-' + Math.abs(data.r - data.b);
             color = '#CC0000';
         } else {
             diffText = '+' + Math.abs(data.r - data.b);
             color = '#00CC00';
         }
     }

     let scoreDiff = new PIXI.Text(diffText, {fontFamily:'Verdana', fontSize:'32px', fontWeight:'bold', fill:color, dropShadow:true, dropShadowAlpha:0.7, dropShadowDistance:1});

     scoreDiff.anchor.x = 0.5;
     scoreDiff.x = ($("#viewport").width() / 2);
     scoreDiff.y = $("#viewport").height() - 100;
     scoreDiff.alpha = 0.7;

     if (!tagpro.ui.sprites.scoreDiff) {
         tagpro.ui.sprites.scoreDiff = new PIXI.Container();
     }

     tagpro.renderer.layers.ui.addChild(tagpro.ui.sprites.scoreDiff);
     tagpro.ui.sprites.scoreDiff.removeChildren();
     tagpro.ui.sprites.scoreDiff.addChild(scoreDiff);
 };

var boatScore = function() {
    let boatText = 'Raptor Boat +2!';
    let color = '#00CC00';

    let boat = new PIXI.Text(boatText, {fontFamily:'Verdana', fontSize:'32px', fontWeight:'bold', fill:color, dropShadow:true, dropShadowAlpha:0.7, dropShadowDistance:1});

    boat.anchor.x = 0.5;
    boat.x = ($("#viewport").width() / 2);
    boat.y = $("#viewport").height() - 134;
    boat.alpha = 0.7;

    if (!tagpro.ui.sprites.boat) {
        tagpro.ui.sprites.boat = new PIXI.Container();
    }

    tagpro.renderer.layers.ui.addChild(tagpro.ui.sprites.boat);
    tagpro.ui.sprites.boat.removeChildren();
    tagpro.ui.sprites.boat.addChild(boat);
    setTimeout(function () {
        boat.alpha = 0;
    }, 5000);
};

function resize(){
    tagpro.renderer.canvas_width = window.innerWidth;
    tagpro.renderer.canvas_height = window.innerHeight;
    tagpro.renderer.resizeView();
    tagpro.renderer.centerView();
    if (score_difference){
        updateScoreDifference({r:tagpro.score.r, b:tagpro.score.b});
    }
}

function updateFOV() {
    var h = $('#viewport').height();
    var w = $('#viewport').width();
    //Resize viewport
    if (h!=window.innerHeight||w!=window.innerWidth){
        resize();
        h = $('#viewport').height();
        w = $('#viewport').width();
    }
    //Auto-zoom to fill viewport
    if(tagpro.spectator && auto_zoom && (oldh!=h ||oldw!=w))
    {
        var yzoom=tagpro.map[0].length*tileSize/h;
        var xzoom=tagpro.map.length*tileSize/w;
        tagpro.zoom=Math.max(xzoom,yzoom,1);
    }
    oldh=h;
    oldw=w;
}
