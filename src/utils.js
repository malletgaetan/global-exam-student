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
  return JSON.parse(
    body
      .slice(start, stop)
      .replace(/&quot;/g, '"')
      .replace(/\\u.{4}/g, "")
  )
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

const getResponsePayload = (responses) => {
  const res = []
  for (const response of responses) {
    const answers = []
    for (const answer of response.exam_answers) {
      if (answer.is_right_answer) answers.push(answer.id)
    }
    res.push({
      id: response.id,
      answers,
    })
  }
  return res
}

const getInitData = async (page) => {
  const { rawJson, csrfToken } = await page.evaluate(async () => {
    const dataPageReg = /data-page="[^"]+"/
    const csrfTokenReg = /\"csrfToken\":\"[^"]+\"/
    const response = await fetch(window.location.href)
    const html = await response.text()
    const jsonData = html.match(dataPageReg)[0]
    const csrfToken = html.match(csrfTokenReg)[0]
    return {
      rawJson: jsonData,
      csrfToken: csrfToken.split(":")[1].replace(/"/g, ""),
    }
  })
  const initData = cleanAndParseJson(rawJson, 11, rawJson.length - 1)
  const planningHREF = await page.evaluate(() => window.location.href)
  return { initData, csrfToken, planningHREF }
}

export default {
  getInitData,
  getNestedsObject,
  getResponsePayload,
  wait,
  foundAndType,
  foundAndClick,
}
