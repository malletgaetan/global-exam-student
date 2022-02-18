import puppeteer from "puppeteer-extra"
import { createCursor } from "ghost-cursor"
import StealthPlugin from "puppeteer-extra-plugin-stealth"
import fs from "fs"

// add stealth plugin and use defaults (all evasion techniques)
puppeteer.use(StealthPlugin())

const ynovURL = "https://auth.global-exam.com/sso/cas/ynov/4594"

const randBetween = (a, b) => Math.floor(Math.random() * (b - a) + a)

const foundAndClick = async (page, cursor, element) => {
  await page.waitForSelector(element)
  await cursor.click(element)
}

const foundAndType = async (
  page,
  cursor,
  element,
  text,
  typeSpeed = randBetween(70, 90)
) => {
  await page.waitForSelector(element)
  await cursor.click(element)
  await page.focus(element)
  await page.keyboard.type(text, { delay: typeSpeed })
}

const wait = (t) => new Promise((res) => setTimeout(res, t))

const cleanAndParseJson = (body, start = 0, stop = body.length) => {
  return body.slice(start, stop).replace(/&quot;/g, '"').replace(/\\u.{4}/g, "")
}

// WOULD BE BETTER TO LOOK AT THE JSON ARCHITECTURE OF FILE
const getNestedsObject = (obj, property, propertyListTest, propertyValue) => {
  let res = []
  if (!obj) return res
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] != "object") continue
    if (key == property) {
      let head = obj[key]
      propertyListTest.forEach((attr) => {
        head = head[attr]
      })
      if (head === propertyValue) {
        res.push(obj)
      }
      continue
    }
    const deeper = getNestedsObject(
      obj[key],
      property,
      propertyListTest,
      propertyValue
    )
    if (deeper.length > 0) res = res.concat(deeper)
  }
  return res
}

const login = async (page, cursor, email, password) => {
  await page.goto(ynovURL)
  await foundAndType(page, cursor, "#username", email)
  await foundAndType(page, cursor, "#password", password)
  await foundAndClick(page, cursor, "input[type='submit']")
  await page.waitForNavigation()
}

const wakeUpStudent = async (page) => {
  const { jsonInitData, csrfToken } = await page.evaluate(async (cb) => {
    const dataPageReg = /data-page="[^"]+"/
    const csrfTokenReg = /\"csrfToken\":\"[^"]+\"/
    const response = await fetch(window.location.href)
    const html = await response.text()
    const jsonData = html.match(dataPageReg)[0]
    const csrfToken = html.match(csrfTokenReg)[0]
    return {
      jsonInitData: cleanAndParseJson(jsonData, 11, jsonData.length-1),
      csrfToken: csrfToken.split(":")[1].replace(/"/g, ""),
    }
  }, cleanAndParseJson)
  // jsonInitData = Buffer.from(jsonInitData).toString()
  const planningHREF = await page.evaluate(() => window.location.href)
  const version = jsonInitData.version
  const activities = getNestedsObject(
    jsonInitData,
    "planning_activity",
    ["activity", "stats", "state"],
    "TODO"
  ).filter(
    (obj) => obj.planning_activity.activity.activity_type_code === "STANDARD"
  )

  for (const activity of activities) {
    console.log("starting job:\n", activity)
    const startPayload = {
      activityId: activity.planning_activity.activity.id,
      userPlanningActivityId: activity.id,
    }

    // START THE ACTIVITY
    let { activityURL, body } = await page.evaluate(
      async (planningHREF, payload, version, csrfToken) => {
        const response = await fetch(
          "https://exam.global-exam.com/training/activity/start",
          {
            method: "POST",
            referrer: planningHREF,
            headers: {
              "content-type": "application/json;charset=UTF-8",
              "accept": "text/html, application/xhtml+xml",
              "accept-language": "en-US,en;q=0.9",
              "content-type": "application/json;charset=UTF-8",
              "sec-fetch-dest": "empty",
              "sec-fetch-mode": "cors",
              "sec-fetch-site": "same-origin",
              "sec-gpc": "1",
              "x-csrf-token-prod": csrfToken,
              "x-inertia": "true",
              "x-inertia-version": version,
              "x-requested-with": "XMLHttpRequest",
            },
            referrerPolicy: "strict-origin-when-cross-origin",
            credentials: "include",
            body: payload,
          }
        )
        return { activityURL: response.url, body: await response.json() }
      },
      planningHREF,
      JSON.stringify(startPayload),
      version,
      csrfToken
    )
    body = cleanAndParseJson(body)
    // while(!activityURL.endsWith("result")) {
    //   page.evaluate((fetchURL, planningHREF) => {
    //     const response = await fetch(
    //       fetchURL,
    //       {
    //         method: "GET",
    //         referrer: planningHREF,
    //         headers: {
    //           "content-type": "application/json;charset=UTF-8",
    //           "accept": "text/html, application/xhtml+xml",
    //           "accept-language": "en-US,en;q=0.9",
    //           "content-type": "application/json;charset=UTF-8",
    //           "sec-fetch-dest": "empty",
    //           "sec-fetch-mode": "cors",
    //           "sec-fetch-site": "same-origin",
    //           "sec-gpc": "1",
    //           "x-csrf-token-prod": csrfToken,
    //           "x-inertia": "true",
    //           "x-inertia-version": version,
    //           "x-requested-with": "XMLHttpRequest",
    //         },
    //         credentials: "include",
    //         body: payload,
    //       }
    //     )
    //     return response.url
    //   }, activityURL, planningHREF)


    //   await wait(randBetween(9000, 17000))
    // }
    await wait(5000)
  }
}

puppeteer
  .launch({
    headless: false,
    executablePath: "/bin/brave-browser",
    // devtools: true
  })
  .then(async (browser) => {
    const page = (await browser.pages())[0]
    const cursor = createCursor(page)
    const email = process.argv[2]
    const password = process.argv[3]

    await login(page, cursor, email, password)

    await foundAndClick(
      page,
      cursor,
      "a[href^='https://exam.global-exam.com/user-plannings/']"
    )

    // BAD BUT SIMPLE
    await wait(2000)

    // const planningLocation = await getPageLocation(page)
    console.log("waking up student")
    await wakeUpStudent(page)
  })
