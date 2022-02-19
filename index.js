import puppeteer from "puppeteer-extra"
import { createCursor } from "ghost-cursor"
import StealthPlugin from "puppeteer-extra-plugin-stealth"
import utils from "./src/utils.js"

// add stealth plugin and use defaults (all evasion techniques)
puppeteer.use(StealthPlugin())

const ynovURL = "https://auth.global-exam.com/sso/cas/ynov/4594"

const login = async (page, cursor, email, password) => {
  await page.goto(ynovURL)
  await utils.foundAndType(page, cursor, "#username", email)
  await utils.foundAndType(page, cursor, "#password", password)
  await utils.foundAndClick(page, cursor, "input[type='submit']")
  await page.waitForNavigation()
}

const wakeUpStudent = async (page) => {
  const { initData, csrfToken, planningHREF } = await utils.getInitData(page)

  const version = initData.version
  const activities = utils
    .getNestedsObject(
      initData,
      "planning_activity",
      ["activity", "stats", "state"],
      "TODO"
    )
    .filter(
      (obj) => obj.planning_activity.activity.activity_type_code === "STANDARD"
    )

  const getFetchOptions = (payload) => ({
    method: "POST",
    referrer: planningHREF,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      accept: "text/html, application/xhtml+xml",
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
    credentials: "include",
    body: JSON.stringify(payload),
  })

  for (const activity of activities) {
    let payload = {
      activityId: activity.planning_activity.activity.id,
      userPlanningActivityId: activity.id,
    }

    let fetchURL = "https://exam.global-exam.com/training/activity/start"
    let redirectedURL = ""

    while (true) {
      // START ACTIVITY IF FIRST ITERATION, GO NEXT IF NOT
      const ret = await page.evaluate(
        async (fetchURL, fetchOptions) => {
          const response = await fetch(fetchURL, fetchOptions)
          return { redirectedURL: response.url, body: await response.text() }
        },
        fetchURL,
        getFetchOptions(payload)
      )
      if (fetchURL.includes("start")) {
        fetchURL = `https://exam.global-exam.com/training/activity/${
          ret.redirectURL.match(/[0-9]+/)[0]
        }/next`
      }
      if (ret.redirectURL.includes("result")) break
      const parsedBody = utils.cleanAndParse(ret.body)
      payload = utils.getResponsePayload(parsedBody.props.examQuestions.data)
      redirectedURL = ret.redirectURL
      await utils.wait(utils.randBetween(4000, 8000))
    }
    await utils.wait(utils.randBetween(5000, 10 * 1000))
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

    await wakeUpStudent(page)
  })
