"use strict";

// 1. Клас для НТТР-помилок (коли сервер відповів кодом 400..599)
class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}

// 2. Універсальна функція запиту JSON із тайм-аутом та підтримкою AbortSignal
async function fetchJson(url, options = {}) {
  const { timeoutMs = 8000, signal } = options;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([timeoutSignal, signal])
    : timeoutSignal;

  let response;
  try {
    response = await fetch(url, { signal: combinedSignal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    if (error.name === "TimeoutError") {
      throw new Error("Сервер не відповів вчасно. Спробуйте ще раз.");
    }
    throw new Error("Немає з'єднання з сервером. Перевірте інтернет.");
  }

  if (!response.ok) {
    throw new HttpError(response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Сервер повернув некоректні дані (не у форматі JSON).");
  }
}

// 3. Перетворення технічної помилки на зрозуміле повідомлення для користувача
function describeError(error) {
  if (error instanceof HttpError) {
    if (error.status === 404) return "Нічого не знайдено (код 404).";
    if (error.status === 429) {
      return "Забагато запитів. Зачекайте хвилину і спробуйте знову.";
    }
    if (error.status >= 500) {
      return "Помилка на боці сервісу. Спробуйте пізніше.";
    }
    return `Сервіс відповів помилкою (код ${error.status}).`;
  }
  return error.message || "Сталася невідома помилка.";
}

// 4. Посилання на DOM-елементи сторінки
const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query-input");
const yearSelect = document.querySelector("#year-select");
const formError = document.querySelector("#form-error");
const statusBox = document.querySelector("#status");
const placesList = document.querySelector("#places");
const resultBox = document.querySelector("#result");
const loadMoreBtn = document.querySelector("#load-more-btn");
const favoritesBox = document.querySelector("#favorites-box");
const favoritesList = document.querySelector("#favorites-list");

const state = {
  status: "idle",
  message: ""
};
let lastAction = null;

function setStatus(status, message = "") {
  state.status = status;
  state.message = message;
  renderStatus();
}

function renderStatus() {
  statusBox.replaceChildren();
  if (state.status === "loading") {
    statusBox.textContent = "Завантаження...";
  } else if (state.status === "empty") {
    statusBox.textContent = state.message;
  } else if (state.status === "error") {
    const text = document.createElement("p");
    text.textContent = state.message;

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = "Повторити";
    retryBtn.addEventListener("click", () => {
      if (lastAction) lastAction();
    });

    statusBox.append(text, retryBtn);
  }
}

// 5. Додаткова функція Г — «Обране» у localStorage (Варіант № 9)
const FAV_KEY = "lab8-favorites-9";
let favorites = loadFavorites();

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  } catch {
    // Ігноруємо помилку запису у сховище
  }
}

function getHolidayId(holiday) {
  return `${holiday.countryCode}-${holiday.date}-${holiday.name}`;
}

function isFavorite(id) {
  return favorites.some((item) => item.id === id);
}

function toggleFavorite(holiday) {
  const id = getHolidayId(holiday);
  if (isFavorite(id)) {
    favorites = favorites.filter((item) => item.id !== id);
  } else {
    favorites.push({
      id,
      date: holiday.date,
      localName: holiday.localName,
      name: holiday.name,
      countryCode: holiday.countryCode
    });
  }
  saveFavorites();
  renderFavorites();
  if (lastAction) {
    // Оновлюємо текст кнопок у поточному списку без зайвого запиту
    const btns = resultBox.querySelectorAll("button[data-fav-id]");
    for (const btn of btns) {
      const favId = btn.dataset.favId;
      btn.textContent = isFavorite(favId) ? "В обраному ★" : "Додати в обране";
    }
  }
}

function renderFavorites() {
  favoritesList.replaceChildren();
  if (favorites.length === 0) {
    favoritesBox.hidden = true;
    return;
  }

  favoritesBox.hidden = false;
  for (const item of favorites) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `★ ${item.date} (${item.countryCode}) — ${item.localName} (натисніть, щоб видалити з обраного)`;
    btn.addEventListener("click", () => toggleFavorite(item));
    li.append(btn);
    favoritesList.append(li);
  }
}

// 6. Nager.Date API — отримання державних свят за роком і кодом країни
const API = {
  publicHolidays: "https://date.nager.at/api/v3/PublicHolidays"
};

function renderHolidays(countryCode, year, holidays) {
  resultBox.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = `Державні свята (${countryCode}, ${year} р.) — знайдено: ${holidays.length}`;

  const grid = document.createElement("div");
  grid.className = "api-grid";

  for (const holiday of holidays) {
    const card = document.createElement("article");
    card.className = "api-card";

    const dateEl = document.createElement("span");
    dateEl.className = "holiday-date";
    dateEl.textContent = holiday.date;

    const localNameEl = document.createElement("p");
    localNameEl.className = "holiday-name";
    localNameEl.textContent = holiday.localName || holiday.name;

    const intlNameEl = document.createElement("p");
    intlNameEl.className = "holiday-meta";
    intlNameEl.textContent = `Міжнародна назва: ${holiday.name}`;

    const typesEl = document.createElement("p");
    typesEl.className = "holiday-meta";
    const typesText = Array.isArray(holiday.types) && holiday.types.length > 0
      ? holiday.types.join(", ")
      : "Public";
    typesEl.textContent = `Тип: ${typesText} | Країна: ${holiday.countryCode}`;

    const favId = getHolidayId(holiday);
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.dataset.favId = favId;
    favBtn.textContent = isFavorite(favId) ? "В обраному ★" : "Додати в обране";
    favBtn.addEventListener("click", () => toggleFavorite(holiday));

    card.append(dateEl, localNameEl, intlNameEl, typesEl, favBtn);
    grid.append(card);
  }

  resultBox.append(heading, grid);
}

async function loadHolidays(countryCode, year) {
  const normalizedCode = countryCode.trim().toUpperCase();
  const normalizedYear = String(year).trim();

  lastAction = () => loadHolidays(normalizedCode, normalizedYear);
  setStatus("loading");
  placesList.replaceChildren();
  resultBox.replaceChildren();
  loadMoreBtn.hidden = true;

  const url = `${API.publicHolidays}/${encodeURIComponent(normalizedYear)}/${encodeURIComponent(normalizedCode)}`;

  try {
    const data = await fetchJson(url);
    const holidays = Array.isArray(data) ? data : [];

    if (holidays.length === 0) {
      setStatus("empty", `За запитом «${normalizedCode}» (${normalizedYear}) свят не знайдено.`);
      return;
    }

    setStatus("success");
    renderHolidays(normalizedCode, normalizedYear, holidays);
  } catch (error) {
    if (error.name === "AbortError") return;
    if (error instanceof HttpError && error.status === 404) {
      setStatus("empty", `За запитом «${normalizedCode}» (${normalizedYear}) нічого не знайдено.`);
      return;
    }
    setStatus("error", describeError(error));
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const rawCode = queryInput.value.trim();

  if (!/^[A-Za-z]{2}$/.test(rawCode)) {
    formError.textContent = "Введіть дволітерний код країни латиницею (наприклад, UA, PL, DE).";
    queryInput.focus();
    return;
  }

  formError.textContent = "";
  loadHolidays(rawCode, yearSelect.value);
});

// Початкове завантаження для демонстрації при відкритті сторінки
renderFavorites();
loadHolidays("UA", yearSelect.value);