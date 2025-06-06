/**
 * @file provider_doctor_content_script.js
 * @brief Content script for doctor schedule web pages.
 */

let errorMsg = ""

/**
 * @brief Scrapes shift data associated with doctor shifts that overlap with the user's schedule.
 * 
 * @returns True if shifts were scraped and set correctly, false otherwise.
 */
async function main() {
  const localStorage = await chrome.storage.local.get(["shifts"]);
  if (Object.entries(localStorage["shifts"]).length === 0) {
    errorMsg = "User shifts have not been set. Stopping."
    return false;
  }

  const updatedLocalStorage = scrapeDoctor(localStorage);

  await chrome.storage.local.set({
    "shifts": updatedLocalStorage["shifts"],
    "doctor_shifts_set": true
  });

  return true;
}

/**
 * @brief Runs main() on window load.
 */
window.onload = async function () {
  const localStorage = await chrome.storage.local.get(["scraping_status"]);
  if (localStorage.scraping_status === SCRAPING_STATUS_ENUM.DOCTOR) {
    let status = await main();
    await new Promise(r => setTimeout(r, 5)); // wait for storage to set correctly

    if (status === true) {
      chrome.runtime.sendMessage({action: "closeCurrentTab"});
    } else {
      alert(errorMsg)
    }
  }
}