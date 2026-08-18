/* =========================================================
   SkyCast — script.js
   ---------------------------------------------------------
   WEATHER API CONFIGURATION
   ---------------------------------------------------------
   This app uses Open-Meteo (https://open-meteo.com), a
   completely FREE weather API that requires NO API KEY and
   NO signup for non-commercial use. There is nothing to
   paste in here — the endpoints below just work out of the
   box. If you ever swap in a different provider that needs
   a key, this is the spot to add it:

       const API_KEY = "YOUR_API_KEY_HERE";

   ========================================================= */

const GEOCODE_URL   = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL  = "https://api.open-meteo.com/v1/forecast";
const REVERSE_URL   = "https://api.bigdatacloud.net/data/reverse-geocode-client"; // free, keyless reverse geocoding

/* ---------------------------------------------------------
   State
   --------------------------------------------------------- */
const state = {
  unit: localStorage.getItem("skycast_unit") || "C",
  theme: localStorage.getItem("skycast_theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  favorites: safeParse(localStorage.getItem("skycast_favorites"), []),
  recents: safeParse(localStorage.getItem("skycast_recents"), []),
  current: null, // { place, weather }
};

function safeParse(str, fallback){
  try{ const v = JSON.parse(str); return v ?? fallback; } catch{ return fallback; }
}

/* ---------------------------------------------------------
   Element refs
   --------------------------------------------------------- */
const el = {
  skyStrip: document.getElementById("skyStrip"),
  statusBanner: document.getElementById("statusBanner"),

  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("citySearch"),
  searchSuggest: document.getElementById("searchSuggest"),

  geoBtn: document.getElementById("geoBtn"),
  unitToggle: document.getElementById("unitToggle"),
  unitLabel: document.getElementById("unitLabel"),
  themeToggle: document.getElementById("themeToggle"),

  heroSkeleton: document.getElementById("heroSkeleton"),
  heroContent: document.getElementById("heroContent"),
  cityName: document.getElementById("cityName"),
  cityMeta: document.getElementById("cityMeta"),
  favBtn: document.getElementById("favBtn"),
  heroIcon: document.getElementById("heroIcon"),
  heroTemp: document.getElementById("heroTemp"),
  heroCondition: document.getElementById("heroCondition"),
  heroFeels: document.getElementById("heroFeels"),
  weatherTip: document.getElementById("weatherTip"),

  valHumidity: document.getElementById("valHumidity"),
  valWind: document.getElementById("valWind"),
  valPressure: document.getElementById("valPressure"),
  valVisibility: document.getElementById("valVisibility"),
  valUv: document.getElementById("valUv"),
  valClouds: document.getElementById("valClouds"),
  valSunrise: document.getElementById("valSunrise"),
  valSunset: document.getElementById("valSunset"),

  hourlyStrip: document.getElementById("hourlyStrip"),
  dailyList: document.getElementById("dailyList"),

  favList: document.getElementById("favList"),
  favEmpty: document.getElementById("favEmpty"),
  recentList: document.getElementById("recentList"),
  recentEmpty: document.getElementById("recentEmpty"),
  clearRecent: document.getElementById("clearRecent"),
};

/* ---------------------------------------------------------
   Weather code -> label / icon group
   (WMO codes, as used by Open-Meteo)
   --------------------------------------------------------- */
const WEATHER_CODES = {
  0:  { label: "Clear sky",            group: "clear"  },
  1:  { label: "Mainly clear",         group: "clear"  },
  2:  { label: "Partly cloudy",        group: "cloudy" },
  3:  { label: "Overcast",             group: "cloudy" },
  45: { label: "Fog",                  group: "fog"    },
  48: { label: "Depositing rime fog",  group: "fog"    },
  51: { label: "Light drizzle",        group: "rain"   },
  53: { label: "Drizzle",              group: "rain"   },
  55: { label: "Dense drizzle",        group: "rain"   },
  56: { label: "Freezing drizzle",     group: "rain"   },
  57: { label: "Dense freezing drizzle", group: "rain" },
  61: { label: "Slight rain",          group: "rain"   },
  63: { label: "Rain",                 group: "rain"   },
  65: { label: "Heavy rain",           group: "rain"   },
  66: { label: "Freezing rain",        group: "rain"   },
  67: { label: "Heavy freezing rain",  group: "rain"   },
  71: { label: "Slight snow fall",     group: "snow"   },
  73: { label: "Snow fall",            group: "snow"   },
  75: { label: "Heavy snow fall",      group: "snow"   },
  77: { label: "Snow grains",          group: "snow"   },
  80: { label: "Slight rain showers",  group: "rain"   },
  81: { label: "Rain showers",         group: "rain"   },
  82: { label: "Violent rain showers", group: "rain"   },
  85: { label: "Slight snow showers",  group: "snow"   },
  86: { label: "Heavy snow showers",   group: "snow"   },
  95: { label: "Thunderstorm",         group: "storm"  },
  96: { label: "Thunderstorm w/ hail", group: "storm"  },
  99: { label: "Severe thunderstorm",  group: "storm"  },
};
function weatherInfo(code){
  return WEATHER_CODES[code] || { label: "Unknown", group: "cloudy" };
}

const TIPS = {
  clear:  ["Clear skies ahead — a great day to be outside.", "Sun's out. Don't forget sunscreen if you'll be out a while."],
  cloudy: ["Overcast but dry — good for a walk without the glare.", "Grey skies today. Keep a light layer handy."],
  fog:    ["Visibility is low — take it slow if you're driving.", "Foggy out there. Headlights on, extra following distance."],
  rain:   ["Grab an umbrella before you head out.", "Wet roads today — allow a little extra travel time."],
  snow:   ["Snow's falling — dress warm and watch for ice underfoot.", "Bundle up. Roads may be slippery."],
  storm:  ["Thunderstorms expected — best to stay indoors if you can.", "Lightning risk today. Avoid open ground and tall isolated trees."],
};
function pickTip(group){
  const arr = TIPS[group] || TIPS.cloudy;
  return arr[Math.floor(Math.random()*arr.length)];
}

/* ---------------------------------------------------------
   Icon builder — small inline SVGs, animated via CSS classes
   --------------------------------------------------------- */
function iconSvg(group, isDay, size=64){
  const sun = `<circle class="icon-sun" cx="32" cy="32" r="12" fill="var(--amber)"/>`;
  const sunRays = `<g class="icon-sun" stroke="var(--amber)" stroke-width="2.4" stroke-linecap="round">
      <line x1="32" y1="6" x2="32" y2="13"/><line x1="32" y1="51" x2="32" y2="58"/>
      <line x1="6" y1="32" x2="13" y2="32"/><line x1="51" y1="32" x2="58" y2="32"/>
      <line x1="13.5" y1="13.5" x2="18.5" y2="18.5"/><line x1="45.5" y1="45.5" x2="50.5" y2="50.5"/>
      <line x1="13.5" y1="50.5" x2="18.5" y2="45.5"/><line x1="45.5" y1="18.5" x2="50.5" y2="13.5"/>
    </g>`;
  const moon = `<path class="icon-cloud" d="M40 14a16 16 0 1 0 10 28 12.5 12.5 0 0 1-10-28Z" fill="var(--sky-light)"/>`;
  const cloud = (x=0,y=0,scale=1,color="var(--mist)") =>
    `<g class="icon-cloud" transform="translate(${x} ${y}) scale(${scale})">
      <path d="M14 40a10 10 0 0 1-2-19.8A13 13 0 0 1 37 15a10.6 10.6 0 0 1-2.3 25H14Z" fill="${color}" stroke="rgba(0,0,0,.06)"/>
    </g>`;
  const drops = (n=3) => Array.from({length:n}).map((_,i) =>
    `<line class="icon-drop" style="animation-delay:${i*0.25}s" x1="${20+i*10}" y1="46" x2="${17+i*10}" y2="54" stroke="var(--sky)" stroke-width="2.4" stroke-linecap="round"/>`
  ).join("");
  const flakes = (n=3) => Array.from({length:n}).map((_,i) =>
    `<circle class="icon-drop" style="animation-delay:${i*0.3}s" cx="${20+i*10}" cy="50" r="1.8" fill="var(--sky-light)"/>`
  ).join("");
  const bolt = `<path d="M30 40 L22 54 L30 52 L27 62 L38 46 L30 48 Z" fill="var(--amber)"/>`;
  const fogLines = `<g stroke="var(--text-tertiary)" stroke-width="2.2" stroke-linecap="round" opacity=".6">
      <line x1="10" y1="42" x2="54" y2="42"/><line x1="14" y1="49" x2="50" y2="49"/><line x1="10" y1="56" x2="54" y2="56"/>
    </g>`;

  let body = "";
  switch(group){
    case "clear":
      body = isDay ? sun+sunRays : moon;
      break;
    case "cloudy":
      body = isDay
        ? sun + cloud(6,10,1,"var(--mist)")
        : moon + cloud(6,10,1,"var(--mist)");
      break;
    case "fog":
      body = cloud(6,4,.9,"var(--mist)") + fogLines;
      break;
    case "rain":
      body = cloud(6,2,1,"var(--mist)") + drops(3);
      break;
    case "snow":
      body = cloud(6,2,1,"var(--mist)") + flakes(3);
      break;
    case "storm":
      body = cloud(6,2,1,"#B7C0CC") + bolt;
      break;
    default:
      body = cloud(6,10,1,"var(--mist)");
  }
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

/* ---------------------------------------------------------
   Utilities
   --------------------------------------------------------- */
function cToF(c){ return c * 9/5 + 32; }
function fmtTemp(c){
  const v = state.unit === "C" ? c : cToF(c);
  return `${Math.round(v)}°`;
}
function fmtTime(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtHour(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric" });
}
function fmtDay(iso, idx){
  if(idx === 0) return "Today";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "short" });
}
function fmtDate(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function windDir(deg){
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
function showStatus(msg, isError=false){
  el.statusBanner.textContent = msg;
  el.statusBanner.hidden = false;
  el.statusBanner.classList.toggle("error", isError);
}
function hideStatus(){ el.statusBanner.hidden = true; }

/* ---------------------------------------------------------
   API calls
   --------------------------------------------------------- */
async function geocodeCity(query){
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Geocoding service unavailable");
  const data = await res.json();
  return data.results || [];
}

async function reverseGeocode(lat, lon){
  try{
    const url = `${REVERSE_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json();
    return {
      name: data.city || data.locality || data.principalSubdivision || "Current location",
      country: data.countryName || "",
      admin1: data.principalSubdivision || "",
      latitude: lat, longitude: lon,
    };
  } catch{
    return { name: "Current location", country: "", admin1: "", latitude: lat, longitude: lon };
  }
}

async function fetchWeather(lat, lon){
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [
      "temperature_2m","relative_humidity_2m","apparent_temperature","is_day",
      "precipitation","weather_code","cloud_cover","pressure_msl",
      "wind_speed_10m","wind_direction_10m"
    ].join(","),
    hourly: ["temperature_2m","precipitation_probability","weather_code","visibility","uv_index"].join(","),
    daily: ["weather_code","temperature_2m_max","temperature_2m_min","sunrise","sunset","precipitation_probability_max","uv_index_max"].join(","),
    timezone: "auto",
    forecast_days: 8,
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if(!res.ok) throw new Error("Weather service unavailable");
  return res.json();
}

/* ---------------------------------------------------------
   Rendering
   --------------------------------------------------------- */
function renderLoading(){
  el.heroSkeleton.hidden = false;
  el.heroContent.hidden = true;
}

function renderWeather(place, weather){
  el.heroSkeleton.hidden = true;
  el.heroContent.hidden = false;

  const cur = weather.current;
  const info = weatherInfo(cur.weather_code);
  const isDay = cur.is_day === 1;

  // Sky strip condition
  const condKey = info.group === "clear" || info.group === "cloudy"
    ? `${info.group}-${isDay ? "day" : "night"}`
    : info.group;
  el.skyStrip.dataset.condition = condKey;

  // Header text
  const region = [place.admin1, place.country].filter(Boolean).join(", ");
  el.cityName.textContent = place.country_only ? place.name : place.name;
  el.cityMeta.textContent = `${region || "—"} · ${new Date().toLocaleDateString([], { weekday:"long", month:"long", day:"numeric" })} · ${new Date().toLocaleTimeString([], { hour:"numeric", minute:"2-digit" })}`;

  // Favorite state
  const isFav = state.favorites.some(f => samePlace(f, place));
  el.favBtn.setAttribute("aria-pressed", String(isFav));
  el.favBtn.title = isFav ? "Remove from favorites" : "Add to favorites";

  // Hero
  el.heroIcon.innerHTML = iconSvg(info.group, isDay, 96);
  el.heroTemp.textContent = fmtTemp(cur.temperature_2m);
  el.heroCondition.textContent = info.label;
  el.heroFeels.textContent = fmtTemp(cur.apparent_temperature);
  el.weatherTip.textContent = pickTip(info.group);

  // Readouts
  el.valHumidity.textContent = `${Math.round(cur.relative_humidity_2m)}%`;
  const windUnit = state.unit === "C" ? "km/h" : "mph";
  const windSpeed = state.unit === "C" ? cur.wind_speed_10m : cur.wind_speed_10m * 0.621371;
  el.valWind.textContent = `${Math.round(windSpeed)} ${windUnit} ${windDir(cur.wind_direction_10m)}`;
  el.valPressure.textContent = `${Math.round(cur.pressure_msl)} hPa`;

  // Find current hour index for visibility/uv
  const nowIdx = findCurrentHourIndex(weather.hourly.time);
  const visKm = weather.hourly.visibility ? weather.hourly.visibility[nowIdx] / 1000 : null;
  el.valVisibility.textContent = visKm != null ? `${visKm.toFixed(1)} km` : "—";
  const uv = weather.hourly.uv_index ? weather.hourly.uv_index[nowIdx] : (weather.daily.uv_index_max ? weather.daily.uv_index_max[0] : null);
  el.valUv.textContent = uv != null ? uv.toFixed(1) : "—";
  el.valClouds.textContent = `${Math.round(cur.cloud_cover)}%`;
  el.valSunrise.textContent = fmtTime(weather.daily.sunrise[0]);
  el.valSunset.textContent = fmtTime(weather.daily.sunset[0]);

  renderHourly(weather, nowIdx);
  renderDaily(weather);
}

function findCurrentHourIndex(times){
  const now = Date.now();
  let idx = 0;
  for(let i=0;i<times.length;i++){
    if(new Date(times[i]).getTime() <= now) idx = i; else break;
  }
  return idx;
}

function renderHourly(weather, startIdx){
  el.hourlyStrip.innerHTML = "";
  const h = weather.hourly;
  const end = Math.min(startIdx + 24, h.time.length);
  for(let i = startIdx; i < end; i++){
    const info = weatherInfo(h.weather_code[i]);
    const isDay = true; // approximate; hourly is_day not requested to keep payload small
    const card = document.createElement("div");
    card.className = "hour-card";
    card.innerHTML = `
      <span class="hour-card__time">${i === startIdx ? "Now" : fmtHour(h.time[i])}</span>
      <span class="hour-card__icon">${iconSvg(info.group, isDay, 30)}</span>
      <span class="hour-card__temp">${fmtTemp(h.temperature_2m[i])}</span>
      <span class="hour-card__rain">${h.precipitation_probability ? h.precipitation_probability[i] : 0}%</span>
    `;
    el.hourlyStrip.appendChild(card);
  }
}

function renderDaily(weather){
  el.dailyList.innerHTML = "";
  const d = weather.daily;
  for(let i = 0; i < d.time.length; i++){
    const info = weatherInfo(d.weather_code[i]);
    const row = document.createElement("div");
    row.className = "day-row";
    row.innerHTML = `
      <span class="day-row__name">${fmtDay(d.time[i], i)}<span class="day-row__date">${fmtDate(d.time[i])}</span></span>
      <span class="day-row__icon">${iconSvg(info.group, true, 26)}</span>
      <span>
        <span class="day-row__cond">${info.label}</span>
        <span class="day-row__rain">${d.precipitation_probability_max ? d.precipitation_probability_max[i] : 0}% rain</span>
      </span>
      <span class="day-row__temps"><span class="max">${fmtTemp(d.temperature_2m_max[i])}</span><span class="min">${fmtTemp(d.temperature_2m_min[i])}</span></span>
    `;
    el.dailyList.appendChild(row);
  }
}

/* ---------------------------------------------------------
   Favorites / recents rendering
   --------------------------------------------------------- */
function samePlace(a, b){
  if(!a || !b) return false;
  return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;
}

function renderChipList(listEl, emptyEl, items, { removable }){
  listEl.querySelectorAll(".chip").forEach(c => c.remove());
  emptyEl.hidden = items.length > 0;
  items.forEach(place => {
    const li = document.createElement("li");
    li.className = "chip";
    li.tabIndex = 0;
    const region = [place.admin1, place.country].filter(Boolean).join(", ");
    li.innerHTML = `<span>${place.name}${region ? `, ${region}` : ""}</span>`;
    li.addEventListener("click", (e) => {
      if(e.target.closest("button")) return;
      loadPlace(place, { addRecent: true });
    });
    li.addEventListener("keydown", (e) => { if(e.key === "Enter") loadPlace(place, { addRecent:true }); });
    if(removable){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `Remove ${place.name}`);
      btn.textContent = "×";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removable(place);
      });
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  });
}

function renderFavorites(){
  renderChipList(el.favList, el.favEmpty, state.favorites, (place) => {
    state.favorites = state.favorites.filter(f => !samePlace(f, place));
    persistFavorites();
    renderFavorites();
    syncFavButton();
  });
}
function renderRecents(){
  renderChipList(el.recentList, el.recentEmpty, state.recents, (place) => {
    state.recents = state.recents.filter(f => !samePlace(f, place));
    persistRecents();
    renderRecents();
  });
}
function persistFavorites(){ localStorage.setItem("skycast_favorites", JSON.stringify(state.favorites)); }
function persistRecents(){ localStorage.setItem("skycast_recents", JSON.stringify(state.recents)); }

function addRecent(place){
  state.recents = [place, ...state.recents.filter(f => !samePlace(f, place))].slice(0, 6);
  persistRecents();
  renderRecents();
}

function syncFavButton(){
  if(!state.current) return;
  const isFav = state.favorites.some(f => samePlace(f, state.current.place));
  el.favBtn.setAttribute("aria-pressed", String(isFav));
}

/* ---------------------------------------------------------
   Core flow
   --------------------------------------------------------- */
async function loadPlace(place, { addRecent: shouldAddRecent = false } = {}){
  hideStatus();
  renderLoading();
  try{
    const weather = await fetchWeather(place.latitude, place.longitude);
    state.current = { place, weather };
    renderWeather(place, weather);
    localStorage.setItem("skycast_last_place", JSON.stringify(place));
    if(shouldAddRecent) addRecent(place);
  } catch(err){
    console.error(err);
    el.heroSkeleton.hidden = true;
    showStatus("Couldn't load weather for that location. Check your connection and try again.", true);
  }
}

async function handleSearchSubmit(e){
  e.preventDefault();
  const query = el.searchInput.value.trim();
  if(!query) return;
  hideStatus();
  el.searchSuggest.hidden = true;
  try{
    const results = await geocodeCity(query);
    if(results.length === 0){
      showStatus(`No city found matching "${query}". Try a different spelling.`, true);
      return;
    }
    const place = results[0];
    await loadPlace(place, { addRecent: true });
  } catch(err){
    console.error(err);
    showStatus("Search failed — please check your connection and try again.", true);
  }
}

let suggestTimer = null;
function handleSearchInput(){
  clearTimeout(suggestTimer);
  const query = el.searchInput.value.trim();
  if(query.length < 2){ el.searchSuggest.hidden = true; return; }
  suggestTimer = setTimeout(async () => {
    try{
      const results = await geocodeCity(query);
      if(results.length === 0){ el.searchSuggest.hidden = true; return; }
      el.searchSuggest.innerHTML = "";
      results.forEach(place => {
        const btn = document.createElement("button");
        btn.type = "button";
        const region = [place.admin1, place.country].filter(Boolean).join(", ");
        btn.innerHTML = `${place.name}<small>${region}</small>`;
        btn.addEventListener("click", () => {
          el.searchInput.value = place.name;
          el.searchSuggest.hidden = true;
          loadPlace(place, { addRecent: true });
        });
        el.searchSuggest.appendChild(btn);
      });
      el.searchSuggest.hidden = false;
    } catch{
      el.searchSuggest.hidden = true;
    }
  }, 320);
}

function handleGeolocate(){
  if(!navigator.geolocation){
    showStatus("Geolocation isn't supported in this browser.", true);
    return;
  }
  hideStatus();
  showStatus("Locating you…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const place = await reverseGeocode(latitude, longitude);
      hideStatus();
      await loadPlace(place, { addRecent: true });
    },
    (err) => {
      let msg = "Couldn't get your location.";
      if(err.code === err.PERMISSION_DENIED) msg = "Location permission denied. You can still search for a city above.";
      else if(err.code === err.POSITION_UNAVAILABLE) msg = "Your location is currently unavailable.";
      else if(err.code === err.TIMEOUT) msg = "Locating you timed out. Please try again.";
      showStatus(msg, true);
    },
    { timeout: 10000 }
  );
}

function handleFavToggle(){
  if(!state.current) return;
  const { place } = state.current;
  const isFav = state.favorites.some(f => samePlace(f, place));
  if(isFav){
    state.favorites = state.favorites.filter(f => !samePlace(f, place));
  } else {
    state.favorites = [place, ...state.favorites].slice(0, 10);
  }
  persistFavorites();
  renderFavorites();
  syncFavButton();
}

function handleUnitToggle(){
  state.unit = state.unit === "C" ? "F" : "C";
  el.unitLabel.textContent = `°${state.unit}`;
  el.unitToggle.setAttribute("aria-pressed", String(state.unit === "F"));
  localStorage.setItem("skycast_unit", state.unit);
  if(state.current) renderWeather(state.current.place, state.current.weather);
}

function handleThemeToggle(){
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  localStorage.setItem("skycast_theme", state.theme);
}
function applyTheme(){
  document.documentElement.setAttribute("data-theme", state.theme);
  el.themeToggle.setAttribute("aria-pressed", String(state.theme === "dark"));
}

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
function bindEvents(){
  el.searchForm.addEventListener("submit", handleSearchSubmit);
  el.searchInput.addEventListener("input", handleSearchInput);
  document.addEventListener("click", (e) => {
    if(!el.searchForm.contains(e.target)) el.searchSuggest.hidden = true;
  });
  el.geoBtn.addEventListener("click", handleGeolocate);
  el.unitToggle.addEventListener("click", handleUnitToggle);
  el.themeToggle.addEventListener("click", handleThemeToggle);
  el.favBtn.addEventListener("click", handleFavToggle);
  el.clearRecent.addEventListener("click", () => {
    state.recents = [];
    persistRecents();
    renderRecents();
  });
}

async function init(){
  applyTheme();
  el.unitLabel.textContent = `°${state.unit}`;
  el.unitToggle.setAttribute("aria-pressed", String(state.unit === "F"));
  bindEvents();
  renderFavorites();
  renderRecents();

  const lastPlace = safeParse(localStorage.getItem("skycast_last_place"), null);
  if(lastPlace){
    await loadPlace(lastPlace);
    return;
  }
  // Default fallback city while we don't yet know the user's location
  const fallback = { name: "London", country: "United Kingdom", admin1: "England", latitude: 51.5074, longitude: -0.1278 };
  await loadPlace(fallback);
}

init();
