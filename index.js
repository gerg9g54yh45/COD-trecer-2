/**
 * Задачи
 * 1. считать килы
 * 2. считать топ1
 * 3. матчи трио и соло (отдельно реги на них)
 * 
 * План
 * 1. получаем список всех зарегистрированных на соло и трио
 * 2. перебираем список запуская функцию для получения результатов (историю матчей)
 * 3. фильтруем историю матчей по времени, по типу игры
 * 4. фильтруем удаляя матчи которые уже были записаны ранее
 * 5. считаем килы и топ1 у новых матчей записывая в обьект (массив обьектов)
 * 6. если есть новые матчи то обновляем данные отправляя их в БД
 * 
 * для трио будет получатся статистика матча и там выбираться эти 3 игрока
 * по player.team лидера фильтроваться от других игроков
 * 
 * 7. иметь функцию которая сможет перебрать данные с БД и просумировать все килы и кол-во топ1 для каждой команды за все время
 */


let dataBase = {} // тут будет данные с БД
const leaderbordMess = {
    solo: {
        chId: "782633077952348160",
        id: "785469649273618442",
        body: null, // само сообщение
        data: null // текст сообщения
    },
    trio: {
        chId: "782633647307358231",
        id: "785469690222477322",
        body: null, // само сообщение
        data: null // текст сообщения
    }
}


const Config = require('./configs.js')
const config = Config.exports || Config
const TIMELENGTH = 1000 * 60 * 60 * 24 * 5 // 5 дней - длительность хаба
const TIMESTART = 1607497200000 // среда 10:00 09
// const TIMECHECK = 1000 * 60 * 60 * 2 // 2 часа - как часто проверять команду (историю)
const TIMECHECK = 1000 * 60 * 15
const API = require('call-of-duty-api')({ ratelimit: { maxRequests: 2, perMilliseconds: 20000, maxRPS: 2 } });
const MWcombatwz = wrapperLimiter(API.MWcombatwz.bind(API), 20000)
const MWFullMatchInfowz = wrapperLimiter(API.MWFullMatchInfowz.bind(API), 20000)

const {Client} = require('discord.js')
const client = new Client()
const request = require('request')






API.login(config.apiLogin, config.apiKey)
.then(logged => {
    console.log(` + Авторизация COD прошла успешно.`)
    // startCheckAllMatches()

    // загружаем данные с БД
    loadDBDate()
    .then(res => {
        if ( !res.status ) return showLogErr(res.e, res.err_msg)

        // запускаем бота
        client.login(config.tokenDiscord)
        client.on("ready", () => {
            console.log(` + Бот запущен!`)

            loadLeaderbordMessage() // загружает сообщение лидербода в память
            .then(res => {
                if ( !res.status ) return showLogErr(res.e, res.err_msg)

                client.user.setActivity('HUB', { type: 'WATCHING' })
                client.user.setStatus('idle')
                client.on("message", startListenMess) // запускаем прослушку сообщений
                // startCheckAllMatches()
            })
            .catch(e => {
                showLogErr(e, "Ошибка загрузки сообщения лидерборда")
            })
        })
    })
    .catch(e => {
        showLogErr(e, "Ошибка загрузки данных бота с БД")
    })
})
.catch(e => {
    showLogErr(e, "Ошибка авторизации COD")
})






// ---> ДИСКОРД --->






function loadDBDate() {
    return new Promise(resolve => {
        sendSite({
			method: "POST",
			json: true,
			url: "https://webmyself.ru/hitbox/hub2.php",
			form: {
				type: "load",
				token: config.dbToken
			}
        })
        .then(res => {
            const body = res.body
            if ( !body ) return {status: false, err_msg: `Ошибка загрузки данных с БД - пустой body`}

            const data = body.data
            data.forEach(team => {
                team.matches = (team.matches && team.matches != "null") ? JSON.parse(team.matches) : []

                team.lastCheck = team.last_сheck
                delete team.last_сheck

                team.ownerId = team.owner_id
                delete team.owner_id

                team.teamName = team.team_name
                delete team.team_name

                team.teamActi = (team.team_acti && team.team_acti != "null") ? JSON.parse(team.team_acti) : []
                delete team.team_acti
            })

            dataBase = data
            return resolve({
                status: true
            })
        })
        .catch(e => {
            return {status: false, e, err_msg: `Ошибка загрузки данных с БД`}
        })
    })
}



function loadLeaderbordMessage() {
    return new Promise(resolve => {
        const lbSolo = new Promise(resolve => {
            client.channels.fetch( leaderbordMess.solo.chId )
            .then(ch => {
                ch.messages.fetch( leaderbordMess.solo.id )
                .then(m => {
                    leaderbordMess.solo.body = m
                    console.log(`Сообщение загруженно`)
                    return resolve({status: true})
                })
            })
            .catch(e => {
                return resolve({status: false, e, err_msg: `Ошибка загрузка сообщения`})
            })
        })

        const lbTrio = new Promise(resolve => {
            client.channels.fetch( leaderbordMess.trio.chId )
            .then(ch => {
                ch.messages.fetch( leaderbordMess.trio.id )
                .then(m => {
                    leaderbordMess.trio.body = m
                    console.log(`Сообщение загруженно`)
                    return resolve({status: true})
                })
            })
            .catch(e => {
                return resolve({status: false, e, err_msg: `Ошибка загрузка сообщения`})
            })
        })

        Promise.all([lbSolo, lbTrio])
        .then(res => {
            if ( res[0].status && res[1].status ) return resolve({status: true})
            return resolve({status: false, data: res})
        })
    })
}



function startListenMess(message) {
    if (message.author.bot) return false // если сообщение от бота то игнорим
	let content = message.content.replace(/[\\\n]+/, '').trim()
    const authorId = message.author.id
    const channelId = message.channel.id

	/**
	 * выполняет код создателя бота внутри, нужно для тестирования и отладки
	 */
	if (authorId == "510112915907543042" && content.toLowerCase().startsWith("!con2 ")) {
		try {
			console.log(+new Date(), new Date())
			eval( content.slice(5) )
			return;
		} catch (e) {
			return console.log(e)
		}
    }

    if ( channelId == "782631894281879582" ) {
        return executeReg( message, content )
    } else if ( channelId == "782904970932518922" && content.toLowerCase().startsWith("!remove ") ) {
        return executeRemove( message, content )    
    } else if ( channelId == "782904970932518922" && content.toLowerCase().startsWith("!add ") ) {
        return executeAdd( message, content )
    } else if ( channelId == "782904970932518922" && content.toLowerCase().startsWith("!team") ) {
        // покажет список тимейтов
        return executeTeam(message)
    }
}



function executeReg(message, content) {
    console.log("executeReg", content)
    const authorId = message.author.id
    /**
     * команда !reg будет означать запуск регистрации или же напоминание о том где она была не допройдена
     * рега будет происходить строго на одном канале и все сообщения на том канале будет отправляться на эту функцию!
     * сообщения людей будут удаляться после обработки, сообщения бота тоже будут удаляться после отправления команды человеком
     * нужен какой-то обьект...
     */

    const team = dataBase.find(team => team.ownerId == authorId)

    if ( content.toLowerCase().startsWith("!reg") ) {

        if ( team && team.mess ) team.mess.then(m => m.delete()).catch(console.log) // удаляем прошлое сообщение

        if ( team ) { // если тима уже есть
            // можно еще сообщить о том на каком этампе регистарции он остановился, если она не завершена
            if ( !team.type ) { // если не указан тип
                team.mess = message.reply(`Вы уже запустили процесс регистарции. Напишите ее тип - **solo** или **trio**`)
            } else if ( !team.teamName ) { // если неуказано название команды
                team.mess = message.reply(`Вы уже запустили процесс регистарции. Напишите название команды.`)
            } else if ( checkTeamFull(team) ) { // если команда заполнена не полностью
                const mess = team.type == "solo" ? "свой активижн ID" : team.teamActi.length == 0 ? "активижн ID капитана команды" : "активижн ID члена команды"
                team.mess = message.reply(`Вы уже запустили процесс регистарции. Напишите ${mess}.`)
            } else {
                team.mess = message.reply(`Вы уже являетесь лидером команды.`)
            }
        } else { // если команды нет то регаем ее
            const team = new Team(authorId) // создаем тиму
            dataBase.push(team) // добавляем ее в список локлаьно
            team.mess = message.reply(`Напишите тип регистрации - **solo** или **trio**.`)
            addTeamDB(team, "reg") // добавляем ее в БД
        }

    } else {
        /**
         * если было написано что-то другое
         * проверяем по id есть ли уже у него тима, если нет тимы то удаляем сообщение и выходим
         * если тима есть то методом исключения понимаем на каком он этапе регистации остановился и продолжаем ее
         * 
         * 1. указать тип регистарции (соло или трио)
         * 2. указать название команды
         * 3. указать acti капитана, потмо остальных, если есть
         */

        // если у человека нет команды, а он чет пишет то просто удаляем его сообщение
        if ( !team ) return message.delete().catch(console.log)

        if ( !team.type ) {
            // если не указан тип
            if ( team.mess ) team.mess.then(m => m.delete()).catch(console.log) // удаляем прошлое сообщение бота

            const con = content.toLowerCase()
            if ( con == "solo" || con == "соло" ) {
                // если рега соло
                team.type = "solo"
                team.mess = message.reply(`Напишите название команды.`)
                addTeamDB(team, "update") // обновляем данные в БД
            } else if ( con == "trio" || con == "трио" ) {
                // если рега трио
                team.type = "trio"
                team.mess = message.reply(`Напишите название команды.`)
                addTeamDB(team, "update") // обновляем данные в БД
            } else {
                // иначе повторяем требования
                team.mess = message.reply(`Напишите тип регистрации - **solo** или **trio**.`)
            }
        } else if ( !team.teamName ) {
            // если не указана команда
            if ( team.mess ) team.mess.then(m => m.delete()).catch(console.log) // удаляем прошлое сообщение бота

            if ( /^[a-zа-я0-9_!+= -]{3,30}$/i.test(content) ) {
                // если удовлетворяет

                // тут же и проверим на существование такой тимы
                const checkHasTeamname = dataBase.find(team => {
                    if ( !team.teamName ) return false // если нет имени то можно не сравнивать
                    return team.teamName.toLowerCase() == content.toLowerCase()
                })
                if ( checkHasTeamname ) {
                    // если такое имя уже используется (проверяем без учета регистра!)
                    team.mess = message.reply(`Такая команда уже существует! Напишите другое название команды.`)
                } else {
                    team.teamName = content
                    
                    // создаем такую роль и присваиваем ее
                    addRoleUsers(message, content)

                    if ( team.type == "solo" ) {
                        team.mess = message.reply(`Напишите свой активижн ID.`)
                    } else {
                        team.mess = message.reply(`Напишите активижн ID капитана команды.`)
                    }
    
                    addTeamDB(team, "update") // обновляем данные в БД
                }
            } else {
                // если содержит недопустимые символы
                team.mess = message.reply(`Название команды содержит недопустимые символы. Длина должна составлять от 3 до 30 символов. Разрешены русские буквы, английские, пробелы, а так же +-=`)
            }
        } else if ( checkTeamFull(team) ) {
            // если указаны не все члены команды
            // проверяем корректность ника и делаем проверку на его существование/открытый профиль
            if ( team.mess ) team.mess.then(m => m.delete()).catch(console.log) // удаляем прошлое сообщение бота

            // проверяем зареган ли такой активижн ID уже
            const checkHasActi = dataBase.find( team => team.teamActi.find(acti => acti.toLowerCase() == content.toLowerCase()) )
            if ( checkHasActi ) {
                // console.log(checkHasActi)
                team.mess = message.reply(`Игрок **${content}** уже учавствует в ${checkHasActi.type}_hub в команде **${checkHasActi.teamName}**`)
            } else {
                // нужно отправить то что бот начал печатать (typing)
                getHistory(content)
                .then(res => {
                    if ( !res.status ) {
                        // если ошибка, то сообщаем об этом
                        const mess = team.type == "solo" ? "своего активижн ID" : team.teamActi.length == 0 ? "активижн ID капитана команды" : "активижн ID члена команды"
                        team.mess = message.reply(`Указанный активижн ID (**${content}**) не существует или же у него скрыт профиль.\nПожалуйста проверьте это и повторите ввод ${mess}.`)
                    } else {
                        // если все правильно
                        team.teamActi.push(content)
                        addTeamDB(team, "update") // обновляем данные в БД

                        if ( team.type == "solo" ) {
                            // если соло и все правильно то сообщаем об окончании регистрации
                            team.mess = message.reply(`Вы успешно зарегистрировались на SOLO hub!`)
                            updateRegsLeaderbord() // тут же обновляем лидерборд
                        } else {
                            // если трио
                            if ( team.teamActi.length == 3 ) {
                                // если тима фулл
                                team.mess = message.reply(`Вы успешно зарегистрировались на TRIO hub!`)
                                updateRegsLeaderbord() // тут же обновляем лидерборд
                            } else {
                                // если нехватает тимейта (1 или 2 не важно)
                                team.mess = message.reply(`Введите активижн ID своего тимейта.`)
                            }
                        }
                    }
                })
            }
        }

    }

    return message.delete().catch(console.log) // после - удаляем сообщение (человека) и выходим
}



function executeRemove(message, content) {
    console.log("executeRemove", content)
    const authorId = message.author.id
    const actiRemove = content.slice(8).trim() // acti который хотим удалить

    // находим тиму того кто пишет (он должен быть лидером)
    const team = dataBase.find(team => team.ownerId == authorId)

    if ( !team ) return message.reply(`Вы не являетесь лидером ни одной из команд.`)

    if ( team.type == "solo" ) {
        // если соло регаистрация
        return message.reply(`В **solo** нельзя менять капитана.`)
    } else if ( team.type == "trio" ) {
        // если трио рега
        // проверяем все ли были записаны (завершена ли рега)
        if ( team.teamActi.length != 3 ) return message.reply(`Ваша команда не заполнена до конца, сначала добавьте всех тимейтов с помощью команды **!add**.`)

        // проверяем есть ли такой аккаунт
        const checkHasActi = team.teamActi.find(acti => acti.toLowerCase() == actiRemove.toLowerCase())
        if ( !checkHasActi ) return message.reply(`Указанный активижн ID (**${actiRemove}**) не найден в вашей команде.`)

        // удаляем его локально
        const index = team.teamActi.indexOf(checkHasActi)
        if ( index == 0 ) return message.reply(`Капитана менять нельзя!`)
        if ( index == -1 ) return message.reply(`Ошибка поиска тимейта для удаления. Сообщите разработчику бота в лс <@510112915907543042>.`)
        team.teamActi.splice(index, 1)

        // отправляем изменения в БД
        addTeamDB(team, "update")
        .then(res => {
            console.log(res, `удаление пользователя ${actiRemove}`)
            if (res) return message.reply(`Пользователь **${actiRemove}** удален из команды.`)
            return message.reply(`Ошибка удаления пользователя ${actiRemove} из БД. Сообщите разработчику бота в лс <@510112915907543042>.`)
        })
    } else {
        // если реги нет - рега не закончена
        return message.reply(`Вы не закончили регистарцию!`)
    }
}



function executeAdd(message, content) {
    console.log("executeAdd", content)
    const authorId = message.author.id
    const actiAdd = content.slice(5).trim() // acti который хотим добавить

    // находим тиму того кто пишет (он должен быть лидером)
    const team = dataBase.find(team => team.ownerId == authorId)

    if ( !team ) return message.reply(`Вы не являетесь лидером ни одной из команд.`)

    if ( team.type == "solo" ) {
        return message.reply(`В **solo** нельзя добавлять тимейтов.`)
    } else if ( team.type == "trio" ) {
        if ( team.teamActi.length == 3 ) return message.reply(`Ваша команда уже полная! Если хотите заменить участников используйте команду **!remove** для удаления тимейта.`)

        // проверяем зареган ли такой активижн ID уже
        const checkHasActi = dataBase.find( team => team.teamActi.find(acti => acti.toLowerCase() == actiAdd.toLowerCase()) )
        if ( checkHasActi ) return message.reply(`Аккаунт **${actiAdd}** уже зарегистрирован в команде **${checkHasActi.teamName}**`)

        // получаем статистику аккаунта для проверки его существования
        getHistory(actiAdd)
        .then(res => {
            if ( !res.status ) {
                console.log(res, actiAdd)
                return message.reply(`Указанный активижн ID (**${actiAdd}**) не существует или же у него скрыт профиль.\nПожалуйста проверьте это и повторите ввод.`)
            }

            // добавляем его локлаьно
            team.teamActi.push(actiAdd)

            // отправляем изменения в БД
            addTeamDB(team, "update")
            .then(res => {
                console.log(res, `добавление пользователя ${actiAdd}`)
                if (res) return message.reply(`Пользователь **${actiAdd}** добавлен в команду.`)
                return message.reply(`Ошибка добавления пользователя ${actiAdd} в БД. Сообщите разработчику бота в лс <@510112915907543042>.`)
            })
        })
    } else {
        // если реги нет - рега не закончена
        return message.reply(`Вы не закончили регистарцию!`)
    }
}



function executeTeam(message) {
    console.log("executeTeam")
    const authorId = message.author.id

    // находим тиму того кто пишет (он должен быть лидером)
    const team = dataBase.find(team => team.ownerId == authorId)

    if ( !team ) return message.reply(`Вы не являетесь лидером ни одной из команд.`)

    if ( team.type == "solo" && team.teamActi.length == 0 ) {
        return message.reply(`Вы зарегистрированны как **solo** и еще не ввели свой активижн id.`)
    } else if ( team.type == "solo" && team.teamActi.length == 1 ) {
        return message.reply(`Ваш зарегистрированный активижн id: **${team.teamActi[0]}**.`)
    } else if ( team.type == "trio" && team.teamActi.length == 0 ) {
        return message.reply(`Вы еще не имеете ни одного тимейта и не указали активижн капитана!`)
    } else if ( team.type == "trio" && team.teamActi.length <= 3 ) {
        const messText = `Капитан: **${team.teamActi[0]}**`
        let text = team.teamActi.length > 1 ? `; Команда: **${team.teamActi.slice(1).join("**, **")}**` : ""
        // if ( text ) text = `, **${text}**`
        return message.reply(`${messText}${text}`)
    } else {
        return message.reply(``)
    }
}



// возвращает true если в команду еще МОЖНО добавить людей (для соло массив пустым должен быть, а дял трио < 3)
function checkTeamFull(team) { // вернет true если есть места для ввода пользователя
    return team.type == "solo" ? team.teamActi.length == 0 : team.teamActi.length < 3
    // if ( team.type == "solo" ) {
    //     return team.teamActi.length == 0
    // } else {
    //     return team.teamActi.length < 3
    // }
}



// создает и добавляет роль
function addRoleUsers(message, rolename) {
    message.guild.roles.create({
        data: {name: rolename}
    })
    .then(role => {
        // добавляем роль
        const member = message.guild.member(message.author)
        if (!member) {
            console.log(`Пользователь вышел с сервера.`)
        }

        member.roles.add(role.id)
        .then(r => {
            console.log(`Роль успешно добавленна`)
        })
        .catch(e => {
            console.log(`Ошибка добавления роли: ${rolename}.`)
        })
    })
    .catch(e => {
        console.log(`Ошибка создания роли: ${rolename}.`)
    })
}



// добавляет указанную тиму в базу данных
function addTeamDB(team, type) {
    return new Promise(resolve => {
        sendSite({
			method: "POST",
			json: true,
			url: "https://webmyself.ru/hitbox/hub2.php",
			form: {
				type,
                token: config.dbToken,
                team
			}
        })
        .then(res => {
            const body = res.body

            if ( !body ) {
                showLogErr(team, `type: ${type}; body пуст`)
                return resolve(false)
            }

            if ( !body.status ) {
                console.log(body)
                showLogErr(body.e, `site: ${body.err_msg}`)
                return resolve(false)
            }

            return resolve(true)
        })
        .catch(e => {
            showLogErr(e, `Ошибка во время отправки регистрации в БД`)
            return resolve(false)
        })
    })
}



class Team {
    constructor(id) {
        this.ownerId = id
        this.matches = []
        this.teamActi = []
        this.lastCheck = +new Date()
    }
}



// обновляет лидерборды после регистрации
function updateRegsLeaderbord() {
    const soloFullTeam = [],
        trioFullTeam = []
    dataBase.forEach(team => { // добавляем полностью созданные тимы в массивы
        if ( team.type == "solo" && team.teamActi.length == 1 ) return soloFullTeam.push(team)
        if ( team.type == "trio" && team.teamActi.length == 3 ) return trioFullTeam.push(team)
    })

    if ( soloFullTeam.length > 30 ) soloFullTeam.length = 30 // ограничение на вывод 30 команд
    if ( trioFullTeam.length > 30 ) trioFullTeam.length = 30 // ограничение на вывод 30 команд

    // формируем текст из массивов
    let messageSoloLeaderbord = {
        embed: {
            title: `HCL Solo #2 Winter HUB`,
            color: 15170518,
            description: `**Список зарегистрированных команд:**\n`
        }
    }
    for (let i = 0; i < soloFullTeam.length; i++) {
        const team = soloFullTeam[i]
        const roleId = getIdRole(team.teamName)
        const text = roleId ? `<@&${roleId}>` : team.teamName
        messageSoloLeaderbord.embed.description += `\n${i+1}. ${text}`
    }

    let messageTrioLeaderbord = {
        embed: {
            title: `HCL Trio #2 Winter HUB`,
            color: 15170518,
            description: `**Список зарегистрированных команд:**\n`
        }
    }
    for (let i = 0; i < trioFullTeam.length; i++) {
        const team = trioFullTeam[i]
        const roleId = getIdRole(team.teamName)
        const text = roleId ? `<@&${roleId}>` : team.teamName
        messageTrioLeaderbord.embed.description += `\n${i+1}. ${text}`
    }

    // обновляем текст сообщений лидерборда
    leaderbordMess.solo.body.edit(messageSoloLeaderbord)
    leaderbordMess.trio.body.edit(messageTrioLeaderbord)
}



// поулчает id роли по имени
function getIdRole(rolename) {
    const guild = client.guilds.cache.get("768390157400670209")
    const roles = guild.roles
    // console.log(roles)
    const roleFind = roles.cache.filter(role => role.name == rolename)
    const roleArray = roleFind.array()
    // console.log( roleArray )
    if ( roleArray.length == 0 ) return false // если роль ненайдена
    return roleArray[0].id
}






// <--- ДИСКОРД <---
//
//
//
//
//
//
// ---> ПАРСИНГ МАТЧЕЙ --->






// запускает проверку всех матчей всех команд всех хабов
// она будет делаться для каждой команды раз в 2 часа
function startCheckAllMatches() {
    // getNameForActiId

    // перебираем команды checkTime
    dataBase.forEach(team => {
        const newCheck = +new Date()
        if ( newCheck - team.lastCheck < TIMECHECK ) return; // пропускаем если время не прошло (TIMECHECK)

        // иначе получаем историю матчей запустив нужную функцию
        if ( team.type == "solo" && team.teamActi.length == 1 ) return executeSolo(team)
        if ( team.type == "trio" && team.teamActi.length == 3 ) return executeTrio(team)
        return showLogErr(team, `TYPE не определен: ${team.type}`)
    })
}



function executeSolo(team) {
    // получаем историю матчей
    getHistory( team.teamActi[0] )
    .then(response => {
        if ( !response.status ) return showLogErr(response.e, response.err_msg)

        const matches = response.data
        if ( !matches.length ) return showLogErr(team, `история матчей пуста`)

        // фильтруем историю матчей
        // console.log(`DO: ----------------------`)
        // console.log(matches)
        matches.filterMatches(team.matches, "br_brsolo")
        // console.log(`POSLE: ----------------------`)
        // console.log(matches)
        // console.log(`\n\n\n`)

        if ( !matches.length ) return showLogErr(team, `нет подходящих матчей (после фильтрации)`)

        // console.log(matches)
        // записываем новые матчи локально
        matches.forEach(match => {
            team.matches.push({
                id: match.matchID,
                kills: match.playerStats.kills
            })
        })

        // обновляем время последнего обновления
        team.lastCheck = +new Date()

        // отправляем изменения на сервер
        // console.log(team)
        sendTeamUpdates(team)
        .then(res => {
            console.log(`Обновление команды ${team.teamName} успешно завершено!`)
        })
        .catch(e => {
            showLogErr(e, `Ошибка при обновлении команды "sendTeamUpdates": ${team.teamName}`)
        })
    })
    .catch(e => {
        showLogErr(e, `Ошибка во время получения истории СОЛО для ${team.teamName}; ${team.teamActi[0]}`)
    })
}



function executeTrio(team) {
    // сначала получаем историю капитана
    const ownActi = team.teamActi[0]
    getHistory( ownActi )
    .then(response => {
        if ( !response.status ) return showLogErr(response.e, response.err_msg)

        const matches = response.data
        if ( !matches.length ) return showLogErr(team, `история матчей пуста`)

        // фильтруем историю матчей
        // console.log(`DO: ----------------------`)
        // console.log(matches)
        matches.filterMatches(team.matches, "br_brtrios")
        // console.log(`POSLE: ----------------------`)
        // console.log(matches)
        // console.log(`\n\n\n`)

        if ( !matches.length ) return showLogErr(team, `нет подходящих матчей (после фильтрации)`)
        const allMatchesPromise = [] // массив содержащий промисы всех матчей, что бы потом запустить обновление 1 раз в самом конце

        matches.forEach(match => {
            const matchesPromise = getMatchForId(match.matchID)
            allMatchesPromise.push(matchesPromise) // добавляем промис

            matchesPromise
            .then(response => {
                if ( !response.status ) return showLogErr(response.e, response.err_msg)

                const allPlayers = response.data.allPlayers
                if ( !allPlayers || !allPlayers.length ) return showLogErr(team, `нет игроков в матче`)

                // получаем команду из матча по acti лидера
                const teamOnMatch = getTeamOnMatch(allPlayers, team.teamActi)
                // console.log(` -------- TEAM:`)
                // console.log(teamOnMatch)

                // складываем их очки
                const sumKills = teamOnMatch.reduce(function(sum, current) {
                    return sum + current.playerStats.kills
                }, 0)

                // вносим изменения локально
                team.matches.push({
                    id: match.matchID,
                    kills: sumKills
                })
            })
            .catch(e => {
                showLogErr(e, `Ошибка getMatchForId ${match.matchID}`)
            })
        })

        // ждем когда закончится првоерка всех матчей
        Promise.all(allMatchesPromise)
        .then(res => {
            console.log(` + Проверка всех матчей команды ${team.teamName} закончена`)
            // раз все успешно закончилось то обновляем время последнего обновления
            team.lastCheck = +new Date()

            // отправляем изменения на сервер
            // console.log(team)
            sendTeamUpdates(team)
            .then(res => {
                console.log(`Обновление команды ${team.teamName} успешно завершено!`)
            })
            .catch(e => {
                showLogErr(e, `Ошибка при обновлении команды "sendTeamUpdates": ${team.teamName}`)
            })
        })
        .catch(e => {
            showLogErr(e, `Ошибка во время ожидания конца всех промисов поулчания матчей команды ${team.teamName}`)
        })
    })
    .catch(e => {
        showLogErr(e, `Ошибка при получении истории матчей ТРИО для ${team.teamName}; ${ownActi}`)
    })
}




/**
 * получает историю матчей по активижн ИД
 * @param {String} actiId - активижн ид
 * @return {Promise, Object} - {status, data, err_msg, e}
 */
function getHistory(actiId) {
    return new Promise(resolve => {
        console.log(`Получаем историю матчей ${actiId}`)

        MWcombatwz(actiId, "acti")
        .then(res => {
            if ( !res ) return resolve({
                status: false,
                err_msg: `!res`
            })

            const matches = res.matches
            if ( !matches ) return resolve({
                status: false,
                err_msg: `!matches - матчи не найдены ${actiId}`
            })
            
            return resolve({
                status: true,
                data: matches
            })
        })
        .catch(e => {
            return resolve({
                status: false,
                err_msg: `catch - аккаунт (${actiId}) не найден или скрыт (скорее всего)`,
                e: e
            })
        })
    })
}



function getMatchForId(id) {
    return new Promise(resolve => {
        console.log(`Получаем матч по id: ${id}`)
        MWFullMatchInfowz(id, "acti")
        .then(res => {
            if ( !res ) return resolve({
                status: false,
                err_msg: `!res`
            })

            return resolve({
                status: true,
                data: res
            })
        })
        .catch(e => {
            return resolve({
                status: false,
                err_msg: `catch - матч ${id} не найден`,
                e: e
            })
        })
    })
}


// отправляет все изменения команды ан сервер
function sendTeamUpdates(team) {
    return new Promise(resolve => {
        sendSite({
            method: "POST",
            json: true,
            url: "https://webmyself.ru/hitbox/hub2.php",
            form: {
                type: "update",
                token: config.dbToken,
                team
            }
        })
    })
}



/**
 * фильтр матчей по времени и моду (тип игры)
 * @param {Array} teamMatches - массив матчей которые уже записаны что бы не брать те, которые еще не записаны
 * @param {String} mode - фильтр по моду
 */
Array.prototype.filterMatches = function(teamMatches, mode) {
    if ( this.length == 0 ) return this

    for (let i = 0; i < this.length; i++) {
        const match = this[i]
        // console.log(`mode: ${mode} = ${match.mode == mode}; utcStartSeconds: ${match.utcStartSeconds} = ${checkTime(match.utcStartSeconds)}`)
        if ( match.mode == mode && checkTime(match.utcStartSeconds) && !teamMatches.find(m => m.id == match.matchID) ) {
            console.log(`оставляем матч ${match.matchID}; матчи тимы:`)
            console.log(teamMatches)
            console.log(`\n`)
            continue; // оставляем (не удаляем)
        }
        this.splice(i, 1)
        i--
    }
}



/**
 * првоеряет входит ли этот промежуток времени в нужный
 * @param {*} timeMatch - время матча
 */
function checkTime(timeMatch) {
	timeMatch *= 1000 // превращаем в мс
	return (timeMatch - TIMESTART) > 0 && (timeMatch - TIMESTART) < TIMESTART + TIMELENGTH
}



/**
 * получаем команду из матча по acti лидера
 * @param {Array} allPlayers - список игроков матча поулченный по id матча
 * @param {String} teamActi - acti команды
 * @return {Array, Boolean} - массив команды либо false если ошибка
 */
function getTeamOnMatch(allPlayers, teamActi) {
    try {
        const ownerActi = teamActi[0] // acti капитана
        const ownerList = allPlayers.filter(function(user) {
            return user.player.username.toLowerCase() == getNameForActiId(ownerActi).toLowerCase()
        })

        if ( !ownerList || ownerList.length != 1 ) return false // если длина массива не равно 0 то ошибка (найдено 0 или больше 1 человека)

        const owner = ownerList[0]
        const team = allPlayers.filter(user => {
            // совпадают команды И юзернейм есть в тиме (челы котоыре были зареганы)
            return user.player.team == owner.player.team && teamActi.find( acti => getNameForActiId(acti).toLowerCase() == user.player.username.toLowerCase() )
        })

        return team
    } catch(e) {
        showLogErr(e, `Оишбка getTeamOnMatch - uno: ${uno}`)
        return false
    }
}


function getSumKills(team) {
    return team.matches.reduce((sum, match) => {
        return +match.kills + sum
    }, 0)
}

// обновляет лидерборды соло и трио суммируя все очки
function hubLeaderbordUpdate() {
    const soloFullTeam = [],
        trioFullTeam = []
    dataBase.forEach(team => { // добавляем полностью созданные тимы в массивы
        if ( team.type == "solo" && team.teamActi.length == 1 ) return soloFullTeam.push(team)
        if ( team.type == "trio" && team.teamActi.length == 3 ) return trioFullTeam.push(team)
    })

    if ( soloFullTeam.length > 30 ) soloFullTeam.length = 30 // ограничение на вывод 30 команд
    if ( trioFullTeam.length > 30 ) trioFullTeam.length = 30 // ограничение на вывод 30 команд

    // сортируем команды по очкам
    soloFullTeam.sort((teamA, teamB) => {
        return getSumKills(teamB) - getSumKills(teamA)
    })

    trioFullTeam.sort((teamA, teamB) => {
        return getSumKills(teamB) - getSumKills(teamA)
    })

    // формируем текст из массивов
    let messageSoloLeaderbord = {
        embed: {
            title: `HCL Solo #2 Winter HUB`,
            color: 15170518,
            description: `**Топ 30 команд:**\n`
        }
    }
    for (let i = 0; i < soloFullTeam.length; i++) {
        const team = soloFullTeam[i]
        const roleId = getIdRole(team.teamName)
        const text = roleId ? `<@&${roleId}>` : team.teamName

        const sumKills = team.matches.reduce((sum, match) => {return +match.kills + sum}, 0)

        messageSoloLeaderbord.embed.description += `\n${i+1}. ${text} - ${sumKills}`
    }

    let messageTrioLeaderbord = {
        embed: {
            title: `HCL Trio #2 Winter HUB`,
            color: 15170518,
            description: `**Топ 30 команд:**\n`
        }
    }
    for (let i = 0; i < trioFullTeam.length; i++) {
        const team = trioFullTeam[i]
        const roleId = getIdRole(team.teamName)
        const text = roleId ? `<@&${roleId}>` : team.teamName

        const sumKills = team.matches.reduce((sum, match) => {return +match.kills + sum}, 0)

        messageTrioLeaderbord.embed.description += `\n${i+1}. ${text} - ${sumKills}`
    }

    // обновляем текст сообщений лидерборда
    leaderbordMess.solo.body.edit(messageSoloLeaderbord)
    leaderbordMess.trio.body.edit(messageTrioLeaderbord)
}






// <--- ПАРСИНГ МАТЧЕЙ <---






// ---> ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ --->



// удаляет хэш и цифры после него из активижн ид
function getNameForActiId(actiId) {
    return actiId.replace(/#\d+$/, "")
}



/**
 * выводит в консоль ошибку правильно оформленную
 * @param {*} err - сама ошибка
 * @param {*} text - основной текст описывающий ошибку
 */
function showLogErr(err="", text="") {
    console.log(` - ${text}. err:`)
    console.log(err)
    console.log(` ---\n`)
}



function sendSite(params) {
	if (!params.strictSSL) params.strictSSL = false
	params.url = encodeURI(params.url)
	const send = params.method == "POST" ? request.post : request.get

	return new Promise((resolve, reject) => {
		send(params, function (error, response) {
			if (error) reject(error)
		  return resolve(response)
		})
	})
}



/**
 * возвращает функцию обертку которая выполняется не чаще чем указанное время при создании обертки
 * @param {*} func - функция обертку для которой мы будем делать
 * @param {*} time - время, не чаще которого функция может быть выполнена
 */
function wrapperLimiter(func, time=1000) {
    let lastStart = 0 // последний запуск функции с учетом очереди!

    return function() {
        if ( lastStart < new Date() - 1000 ) {
            // если функция давно не вызывалась то запускаем ее сейчас
            lastStart = +new Date()
            return new Promise(resolve => resolve( func.apply(this, arguments) ))
        } else {
            // если функция стоит в очереди запуска
            const timeNext = lastStart - new Date() + time // время через которое функция будет запущенна
            lastStart += time
            return new Promise(resolve => {
                setTimeout(() => {
                    return resolve( func.apply(this, arguments) )
                }, timeNext)
            })
        }
    }
}




// setInterval(hubLeaderbordUpdate, 1000 * 60 * 5) // каждые 5 минут обновление лидерборда матчей
// setInterval(startCheckAllMatches, 1000 * 60 * 90) // каждые 30 минут чекаем стату всех матчей