const PROVIDER_ENUM = {
  DOCTOR: 1,
  PA: 2
}

const patterns = {
  1: { pattern: /(\w+)\s(\d{2}|\d{4})-(\d{2}|\d{4}):\s((?:\w|\*)+)/, groupNames: ["location", "start_time_str", "end_time_str", "name"] }, // North 2130-0600: Axs
  2: { pattern: /(\d{2}|\d{4})-(\d{2}|\d{4})\s\((\w+)\):\s((?:\w|\*)+)/, groupNames: ["start_time_str", "end_time_str", "location", "name"] }, // 1700-0100 (RED): Axs
  3: { pattern: /(\d{2}|\d{4})-(\d{2}|\d{4})\s(\w+):\s((?:\w|\*)+)/, groupNames: ["start_time_str", "end_time_str", "location", "name"] } // 1900-0330 PA: Axs
};

let userWorkdaysDict = {}

class WorkDay {
  constructor(startDateTime, endDateTime, location, name, overnight = false) {
    this.startDateTime = startDateTime;
    this.endDateTime = endDateTime;
    this.location = location;
    this.overnight = overnight;
    this.name = name;
    this.providerType = -1;
    this.providerName = "FIX ME";
  }

  set_provider(providerName, providerType) {
    this.providerName = providerName;
    this.providerType = providerType;
  }

  add_to_calendar() {
    // TODO: use google calendar api to create events
    // TODO: catch overnight shifts here
  }

  // hardcoded for PST
  get_utc_to_local_isostring(date) {
    const isostring = new Date(date - new Date().getTimezoneOffset(8) * 60000).toISOString()
    return isostring.replace('Z', '-08:00');
  }

  get_json() {
    return {
      "startDateTime": this.get_utc_to_local_isostring(this.startDateTime),
      "endDateTime": this.get_utc_to_local_isostring(this.endDateTime),
      "location": this.location,
      "overnight": this.overnight,
      "providerType": this.providerType,
      "providerName": this.providerName
    }
  }

  print() {
    let prefix = "";
    if (this.providerType === PROVIDER_ENUM.DOC_PROVIDER) {
      prefix = "DR ";
    } else if (this.providerType === PROVIDER_ENUM.PA_NP_PROVIDER) {
      prefix = "PA/NP ";
    }

    console.log(`${prefix}${this.providerName}`);
    console.log(this.location);
    console.log(this.get_utc_to_local_isostring(this.startDateTime, 8));
    console.log(this.get_utc_to_local_isostring(this.endDateTime, 8));
    console.log(" ");
  }
}

function parseEvent(elem, month, year) {
  const dayElement = document.evaluate(
    "./preceding-sibling::div[1]",
    elem, // root node
    null, // context node's namespace resolver
    XPathResult.FIRST_ORDERED_NODE_TYPE, // result type
    null // result object (not needed here)
  ).singleNodeValue;
  const day = dayElement.textContent;

  let info = {};
  let patternKey = 0;
  for (const [key, { pattern, groupNames }] of Object.entries(patterns)) {
    patternKey = key;
    const match = elem.textContent.match(pattern);
    if (match) {
      info = groupNames.reduce((acc, name, i) => {
        acc[name] = match[i + 1];
        return acc;
      }, {});
      break;
    }
  }

  if (patternKey === 0) {
    console.log("Event does not match.");
    console.log(elem.textContent);
    return undefined;
  }

  if (info["end_time_str"].length === 2) {
    info["end_time_str"] += "00";
  }

  if (info["start_time_str"].length === 2) {
    info["start_time_str"] += "00";
  }

  // edge case for 2400
  if (info["end_time_str"] === "2400") {
    info["end_time_str"] = "2359";
  }
  if (info["start_time_str"] === "2400") {
    info["start_time_str"] = "2359";
  }

  // get month
  const monthNumber = new Date(month + " 1, 2021").getMonth();
  const startDateTime = new Date(
    parseInt(year),
    monthNumber,
    parseInt(day),
    parseInt(info["start_time_str"].slice(0, 2)),
    parseInt(info["start_time_str"].slice(2)),
    0
  );
  const endDateTime = new Date(
    parseInt(year),
    monthNumber,
    parseInt(day),
    parseInt(info["end_time_str"].slice(0, 2)),
    parseInt(info["end_time_str"].slice(2)),
    0
  );

  // edge case for overnight shifts
  let overnight = false;
  if (parseInt(info["end_time_str"].slice(0, 2)) < parseInt(info["start_time_str"].slice(0, 2))) {
    overnight = true;
    endDateTime.setDate(endDateTime.getDate() + 1)
  }

  return new WorkDay(
    startDateTime,
    endDateTime,
    info["location"],
    info["name"],
    overnight
  );
}

function scrapeUser() {
  // get month and year
  const monthYearElement = document.querySelector("div:first-of-type > div:first-of-type");
  const match = monthYearElement.textContent.match(/(\w+)\s(\d{4})/);
  const month = match[1];
  const year = match[2];

  // get all workday elements
  const elements = document.querySelectorAll("td > span");

  // parse workday elements
  let workdays = [];
  for (const elem of elements) {
    const wd = parseEvent(elem, month, year);
    if (wd !== undefined) {
      userWorkdaysDict[wd.startDateTime] = wd;
      workdays.push(wd);
    }
  }

  return workdays;
}

function scrapeProvider(localStorage, providerType) {
  // get month and year
  const monthYearElement = document.querySelector("div:first-of-type > div:first-of-type");
  const match = monthYearElement.textContent.match(/(\w+)\s(\d{4})/);
  const month = match[1];
  const year = match[2];

  // get all workday elements
  const elements = document.querySelectorAll("td > span");

  // parse workday elements
  const workdays = [];
  for (const elem of elements) {
    // start time always aligns with axs
    const wd = parseEvent(elem, month, year);
    if (providerType === PROVIDER_ENUM.PA) {
      wd.location = "PA";
    }

    if (wd !== undefined) {
      const dateStr = wd.get_utc_to_local_isostring(wd.startDateTime)
      const userWd = localStorage["workdays"][dateStr];
      if (userWd !== undefined && userWd["location"] === wd.location) {
        workdays.push(wd);
        localStorage["workdays"][dateStr]["providerName"] = wd.name;
        localStorage["workdays"][dateStr]["providerType"] = providerType;
      }
    }
  }

  return [workdays, localStorage];
}