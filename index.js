const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const mongo = require('mongodb').MongoClient;
const dotenv = require('dotenv').config();
const bot = new Discord.Client();

const { Player } = require("discord-music-player");
const player = new Player(bot);
bot.player = player;

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
  
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
  
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
  
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  
    return array;
}

mongo.connect(process.env.MONGO_URI, (err, database) =>{
    if(err) {
        console.log('Database error: ' + err);
    } else {
        console.log('Successful database connection');


        const db = database.db('SchmiBotDatabase');

        var songs;
        var queue;
        var newSongs = [];
        var newInQueue = false;
        var listPausing = true;

        bot.once('ready', () => {
            console.log("SchmiBot is online!");
        });

        

        bot.on('message', async (msg) => {
            let prefix = "s!";

            if(!msg.content.startsWith(prefix)) return;


            const args = msg.content.slice(prefix.length).trim().split(/ +/g);
            const command = args.shift().toLowerCase();
            

            if(command === 'create'){
                if(await db.collection('SongLists').findOne({name: args[0]})){
                    msg.channel.send('List with that name already exists.');
                }else{
                    db.collection('SongLists').insert({
                        name: args[0],
                        songs: []
                    });
                    msg.channel.send('Song list '+args[0]+' created!');
                }
            }

            if(command === 'add'){
                if(await db.collection('SongLists').findOne({name: args[0]})){
                    let list = await db.collection('SongLists').findOne({name: args[0]});
                    list.songs.push(args[1]);
                    db.collection('SongLists').updateOne({name: args[0]}, {
                        $set: {songs: list.songs}
                    });
                    let songInfo = await ytdl.getInfo(args[1]);
                    msg.channel.send(songInfo.videoDetails.title+' has been added to list '+args[0]+'!');
                }else{
                    msg.channel.send('List with name '+args[0]+" doesn't exist.");
                }
            }

            if(command === 'remove-song'){
                if(await db.collection('SongLists').findOne({name: args[0]})){
                    let list = await db.collection('SongLists').findOne({name: args[0]});
                    let songs = list.songs;
                    const index = songs.indexOf(args[1]);
                    if(index > -1){
                        let song = songs.splice(index, 1);
                        db.collection('SongLists').updateOne({name: args[0]}, {
                            $set: {songs: songs}
                        });
                        let songInfo = await ytdl.getInfo(args[1]);
                        msg.channel.send(songInfo.videoDetails.title+' has been removed from list '+args[0]+'!');
                    }else{
                        msg.channel.send('Song not found in list.');
                    }
                }else{
                    msg.channel.send('List with name '+args[0]+" doesn't exist.");
                }
            }

            if(command === 'remove-list'){
                if(await db.collection('SongLists').findOne({name: args[0]})){
                    db.collection('SongLists').deleteOne({name: args[0]});
                    msg.channel.send('List with name '+args[0]+" deleted.");
                }else{
                    msg.channel.send('List with name '+args[0]+" doesn't exist.");
                }
            }

            if(command === 'view'){
                if(await db.collection('SongLists').findOne({name: args[0]})){
                    let list = await db.collection('SongLists').findOne({name: args[0]});
                    let songs = list.songs;
                    let string = '```Songs in list '+args[0]+':\n';
                    for(let i = 0; i < songs.length; i++){
                        let song = new URL(songs[i]);
                        let songInfo = await ytdl.getInfo(song.toString());
                        string += i+1+'. '+songInfo.videoDetails.title+'\n';
                    }
                    string += '```';
                    msg.channel.send(string);
                }else{
                    msg.channel.send('List with name '+args[0]+" doesn't exist.");
                }
            }

            if(command === 'lists'){
                let lists = await db.collection('SongLists').find({}).toArray();
                let string = '```Song lists:\n';
                for(let i = 0; i < lists.length; i++){
                    string += i+1+'. '+lists[i].name+' (Songs in list: '+lists[i].songs.length+')\n';
                }
                string += '```';
                msg.channel.send(string); 
            }

            if(command === 'play'){
                if(!msg.member.voice.channel){
                    msg.channel.send('You need to be in a voice channel to play music!');
                    return;
                }
                if(bot.player.isPlaying(msg.guild.id)){
                    await bot.player.stop(msg.guild.id);
                }
                if(await db.collection('SongLists').findOne({name: args[0]})){
                    let list = await db.collection('SongLists').findOne({name: args[0]});
                    songs = list.songs;
                    songs = shuffle(songs);
                    msg.channel.send('Playing song list '+args[0]+'!');
                    let song = await bot.player.play(msg.member.voice.channel, songs[0]);
                    song = song.song;
                    let songInfo = await ytdl.getInfo(song.url);
                    msg.channel.send('Currently playing '+songInfo.videoDetails.title);
                    for(let i = 1; i < songs.length; i++){
                        console.log("Adding to queue");
                        bot.player.addToQueue(msg.guild.id, songs[i]);
                    }
                    bot.player.getQueue(msg.guild.id).on('songChanged', async (oldSong, newSong) => {
                        let songInfo = await ytdl.getInfo(newSong.url);
                        msg.channel.send('Currently playing '+songInfo.videoDetails.title);
                    }).on('end', () => {
                        msg.channel.send('Song list finished playing.');
                    });
                }else{
                    msg.channel.send('List with name '+args[0]+" doesn't exist.");
                }
            }

            if(command === 'skip'){
                if(!bot.player.isPlaying(msg.guild.id)){
                    msg.channel.send('Nothing is currently playing!');
                }else{
                    let song = await bot.player.skip(msg.guild.id);
                    msg.channel.send(`Song skipped!`);
                }
            }

            if(command === 'pause'){
                if(!bot.player.isPlaying(msg.guild.id)){
                    msg.channel.send('Nothing is currently playing!');
                }else{
                    let song = await bot.player.pause(msg.guild.id);
                    msg.channel.send(`Playing paused!`);   
                }
            }

            if(command === 'resume'){
                if(!bot.player.isPlaying(msg.guild.id)){
                    msg.channel.send('Nothing is currently playing!');
                }else{
                    let song = await bot.player.resume(msg.guild.id);
                    msg.channel.send(`Playing resumed!`);   
                }
            }

            if(command === 'stop'){
                if(!bot.player.isPlaying(msg.guild.id)){
                    msg.channel.send('Nothing is currently playing!');
                }else{
                    let track = await bot.player.stop(msg.guild.id);
                    msg.channel.send('Stopped playing');   
                }
            }

            if(command === 'help'){
                let string = '```List of commands:\n';
                string += 's!create [list-name]\t-\tcreates a song list with name [list-name]\n';
                string += 's!add [list-name] [song-url]\t-\tadds a song with [song-url] to a song list with name [list-name]\n';
                string += 's!remove-song [list-name] [song-url]\t-\tremoves a song with [song-url] from a song list with name [list-name]\n';
                string += 's!remove-list [list-name]\t-\tdeletes a song list with name [list-name]\n';
                string += 's!view [list-name]\t-\tshows all the songs in a list with name [list-name]\n';
                string += 's!lists\t-\tshows all song lists currently available\n';
                string += 's!play [list-name]\t-\tplays a shuffled song list with name [list-name] in the voice channel\n';
                string += 's!skip\t-\tskips a song that is currently playing\n';
                string += 's!pause\t-\tpauses a song that is currently playing\n';
                string += 's!resume\t-\tresumes a song that is currently playing\n';
                string += 's!stop\t-\tstops a song list from playing```';
                msg.channel.send(string);
            }

        });

        bot.login(process.env.TOKEN);
    }
});