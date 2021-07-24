const versionNumber = "0.1.2";


const express = require('express');
const fetch  = require('node-fetch');
const fs = require('fs');
const dirTree = require("directory-tree");
const bodyParser = require('body-parser');
const multer  = require('multer');
const cors = require('cors')

const app = express(); 
const port = 3000;
// app.use(cors())
app.listen(port, () => console.log(`Listening on port ${port}`));

let mainConfig;
try{
    mainConfig = require('./config.json');
} catch(e){
    console.log("[BOOT] First boot detected, I need to connect to a panel!")
}

if (!fs.existsSync(`./files`)) {
    fs.mkdirSync(`./files`);
};

app.use(bodyParser.json());

app.use( async ( req,res,next ) => {
    if(!mainConfig && req.method == "GET") return res.send({error:"No panel connected"});
    if(!mainConfig && req.method == "POST") {
        console.log("[CONNECTION] A panel has connected negotiating a connection!")
        const { panelURL, baceURL, token } = req.body;
        if ( !panelURL || !baceURL || !token ) return res.status(403).send({error:"missing type"});
        mainConfig = {
            bace_url: baceURL,
            auth_key: token,
            panel: {
                bace_url: panelURL,
            },
        };
        fs.writeFile('config.json', JSON.stringify(mainConfig), e => console.log);
        console.log("[CONNECTION] Successfully connected to the panel!");
        return res.send({token});
    };
    next();
});

app.post("/", (req, res) => {
    return res.send({error: "This node is already populated by a panel!"})
});

function sanitizePath(path){ 
    if (!path) return;
    while (path.includes("%X98")){
        path = path.replace("%X98"," ");
    };
    while (path.includes("//")){
        path = path.replace("//","/");
    };
    while (path.includes("..")){
        path = path.replace("..","");
    };
    return path;
};

function checkAuth(req,res,next){
    if (!req.headers["authorization"]) return res.send({error: "No Auth"});
    if (req.headers["authorization"] != mainConfig.auth_key) return res.send({error: "Bad Auth"});
    next();
};


app.get("/status", checkAuth, (req, res) => {
    return res.send({status: "Ready and Waiting!", versionNumber})
});

app.get("/bucket/createDir/:id", checkAuth, async ( req,res ) => {
    try{
        fs.mkdirSync(`./files/${req.params.id}${req.query.path}${req.query.name}`);
    } catch (e){
        return res.send({error: 'Dir all ready exists'});
    }
    return res.send({success: true});
});

app.get("/bucket/delete", checkAuth, async ( req,res ) => {
    if(dirTree(`./files/${req.query.id}`).children.length !=0) return res.send({error: "bucket not empty"});
    fs.rmdirSync(`./files/${req.query.id}`, { recursive: true });
    return res.send({success: true});
});

app.get("/bucket/delFile/:id", checkAuth, async ( req,res ) => {
    if (!fs.existsSync(`./files/${req.params.id}${req.query.path}`)) {
        return res.send({error: "No file exists!"});
    };
    fs.rmdirSync(`./files/${req.params.id}${req.query.path}`, { recursive: true });
    return res.send({success: true});
});


app.get("/bucket/:id", checkAuth, async ( req,res ) => {
    const path = req.query.path;
    if (!fs.existsSync(`./files/${req.params.id}`)) {
        fs.mkdirSync(`./files/${req.params.id}`);
    };
    if (!fs.existsSync(`./files/${req.params.id}${path}`)) return res.send({error: "No Path"});
    let files = dirTree(`./files/${req.params.id}${path}`);
    return res.send({ files });
});

app.post("/api/files/upload", async ( req,res, next ) => {

    let body = JSON.stringify({key: req.query.key, for: "upload", bucket: req.query.bucket});
    console.log(body)
    let request = await fetch(mainConfig.panel.bace_url + `/node/checkPerms`, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: mainConfig.auth_key,
    body}})
    .catch(e=> console.error);       
    // console.log(request) 
    request = await request.json();
    if (!request.permission) return res.send({error: "No Auth!"});

    // if (parseInt(req.user.permissions[0]) < 2 ) return res.status(403).send({error: "This API key doesn't have permission to preform this action!"});
    if (!req.query.path || !req.query.bucket) return res.status(400).send({error: "Missing type"});

    req.query.path = sanitizePath(req.query.path);

    if (!req.query.path.startsWith("/")) req.query.path = "/"+ req.query.path;

    var storage = multer.diskStorage({
        destination: `./files/${req.query.bucket}${req.query.path}`,
        filename: function (req, file, cb) {
            cb(null, file.originalname);
        }
      })

    var upload = multer({dest: `./files/${req.query.bucket}${req.query.path}`, storage }).array('file');

    upload(req, res, function(err) {

        if (req.fileValidationError) {
            return res.send(req.fileValidationError);
        }
        else if (!req.file) {
            return res.send({error: "No file uploaded!"});
        }
        else if (err instanceof multer.MulterError) {
            return res.send(err);
        }
        else if (err) {
            return res.send(err);
        }
        if (req.query.web == "") return res.redirect(`../../../bucket/${req.query.bucket}?p=${req.query.path}`);
        return res.send({success: true});
    });
});



app.get("/bucket/download/:id*", async ( req,res,next ) => {
    
    let body = JSON.stringify({key: req.query.key, for: "download", bucket: req.params.id});
    console.log(body)
    let request = await fetch(mainConfig.panel.bace_url + `/node/checkPerms`, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: mainConfig.auth_key,
    body}})
    .catch(e=> console.error);       
    // console.log(request) 
    request = await request.json();
    if (!request.permission) return res.send({error: "No Auth!"});
    next();
});

app.use('/bucket/download', express.static('files'));