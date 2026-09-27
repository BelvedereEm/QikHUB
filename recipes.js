// ================================
// QikHUB offline build library
// Used by "Inspire Me" when AI isn't available.
// Each recipe lists the parts it needs. A part is matched when an
// inventory item's category is in `cat`, or its name/notes contain
// one of the `any` keywords (matched at word starts).
// Add your own recipes to the end of this list.
// ================================

const MCU = {
  label: "a microcontroller (Arduino, ESP32, Pico…)",
  cat: ["Microcontroller"],
  any: ["arduino", "esp32", "esp8266", "nodemcu", "wemos", "pico", "rp2040",
        "attiny", "microcontroller", "uno", "nano", "mega", "pro micro",
        "leonardo", "teensy", "stm32", "microbit", "micro:bit"]
};

const WIFI_MCU = {
  label: "a Wi-Fi board (ESP32 / ESP8266 / Pico W)",
  any: ["esp32", "esp8266", "nodemcu", "wemos", "pico w", "wifi", "wi-fi"]
};

const LEDS = {
  label: "LEDs",
  cat: ["LED / Lighting"],
  any: ["led", "neopixel", "ws2812", "sk6812", "light strip", "bulb"]
};

const ADDRESSABLE = {
  label: "addressable LEDs (NeoPixel / WS2812)",
  any: ["neopixel", "ws2812", "ws2811", "sk6812", "addressable", "apa102"]
};

const BUTTON = {
  label: "a button or switch",
  cat: ["Switch / Button"],
  any: ["button", "switch", "tactile", "pushbutton", "toggle"]
};

const BUZZER = {
  label: "a buzzer or small speaker",
  any: ["buzzer", "piezo", "speaker", "beeper"]
};

const DISPLAY = {
  label: "a small display (OLED / LCD)",
  any: ["oled", "lcd", "display", "tft", "screen", "ssd1306", "e-ink", "epaper", "7-segment", "seven segment"]
};

const ULTRASONIC = {
  label: "an ultrasonic / distance sensor",
  any: ["ultrasonic", "hc-sr04", "sr04", "distance", "tof", "vl53", "lidar", "rangefinder"]
};

const PIR = {
  label: "a PIR motion sensor",
  any: ["pir", "motion", "hc-sr501", "sr501", "am312"]
};

const TEMP = {
  label: "a temperature / humidity sensor",
  any: ["dht", "dht11", "dht22", "bme280", "bmp280", "bme680", "ds18b20",
        "temperature", "humidity", "aht", "sht3", "thermistor"]
};

const MOISTURE = {
  label: "a soil moisture sensor",
  any: ["soil", "moisture", "capacitive sensor"]
};

const RELAY = {
  label: "a relay or MOSFET module",
  any: ["relay", "mosfet", "transistor", "ssr", "solid state"]
};

const DC_MOTOR = {
  label: "a DC motor",
  cat: ["Motor"],
  any: ["dc motor", "motor", "gearmotor", "gear motor", "tt motor"]
};

const MOTOR_DRIVER = {
  label: "a motor driver (L298N, TB6612…)",
  any: ["l298", "l293", "tb6612", "drv8833", "motor driver", "h-bridge", "h bridge", "motor shield"]
};

const SERVO = {
  label: "a servo",
  any: ["servo", "sg90", "mg90", "mg996"]
};

const PUMP = {
  label: "a small water pump",
  any: ["pump", "peristaltic"]
};

const POWER = {
  label: "a power source (battery pack / USB)",
  cat: ["Power"],
  any: ["battery", "18650", "lipo", "aa ", "usb", "power supply", "power bank", "charger", "buck", "boost"]
};

const LIGHT_SENSOR = {
  label: "a light sensor (LDR / photoresistor)",
  any: ["ldr", "photoresistor", "photocell", "light sensor", "bh1750", "photodiode"]
};

const POT = {
  label: "a potentiometer or rotary encoder",
  any: ["potentiometer", "pot", "encoder", "knob", "rotary"]
};

const REED = {
  label: "a reed switch or tilt sensor",
  any: ["reed", "magnet", "tilt", "hall"]
};

const USB_MCU = {
  label: "a board with native USB (Pro Micro, Pico, Leonardo, ESP32-S3)",
  any: ["pro micro", "pico", "rp2040", "leonardo", "32u4", "esp32-s3", "esp32 s3", "teensy", "seeed xiao"]
};

const SALVAGED = {
  label: "something salvaged",
  cat: ["Salvaged"],
  any: ["salvaged", "scrap", "teardown", "broken", "old "]
};


const RECIPES = [
  {
    title: "Motion-activated night light",
    difficulty: "Easy",
    summary: "LEDs that fade on when someone walks past and switch off after a minute. Great for a hallway, closet or under the bed.",
    firstStep: "Wire the PIR sensor to a digital pin and print its state to the serial monitor while you wave at it.",
    needs: [MCU, PIR, LEDS]
  },
  {
    title: "Plant thirst monitor",
    difficulty: "Easy",
    summary: "Stick a sensor in a pot and get a light, beep or on-screen warning when the soil dries out.",
    firstStep: "Read the moisture sensor in dry soil and in a glass of water to find your two calibration numbers.",
    needs: [MCU, MOISTURE, LEDS]
  },
  {
    title: "Automatic plant waterer",
    difficulty: "Medium",
    summary: "Measure soil moisture and run a small pump for a few seconds when the plant needs a drink.",
    firstStep: "Test the pump on its own power supply through the relay before connecting the sensor logic.",
    needs: [MCU, MOISTURE, PUMP, RELAY]
  },
  {
    title: "Desk weather station",
    difficulty: "Easy",
    summary: "A tiny screen on your desk showing room temperature and humidity, with a min/max for the day.",
    firstStep: "Get the sensor reading into the serial monitor, then draw a single number on the display.",
    needs: [MCU, TEMP, DISPLAY]
  },
  {
    title: "Wi-Fi remote switch",
    difficulty: "Medium",
    summary: "Turn a lamp, fan or low-voltage gadget on and off from a web page on your phone.",
    firstStep: "Flash a basic web-server example to the board and toggle its onboard LED from your phone.",
    needs: [WIFI_MCU, RELAY]
  },
  {
    title: "Reaction-time game",
    difficulty: "Easy",
    summary: "An LED lights up after a random delay and you slap the button as fast as you can. Tracks your best score.",
    firstStep: "Make the LED light after a random delay, then time how long until the button is pressed.",
    needs: [MCU, BUTTON, LEDS]
  },
  {
    title: "Obstacle-avoiding robot",
    difficulty: "Hard",
    summary: "A two-wheeled bot that drives around the room and turns away whenever something gets too close.",
    firstStep: "Spin each motor forward and backward through the driver before you add the distance sensor.",
    needs: [MCU, DC_MOTOR, MOTOR_DRIVER, ULTRASONIC, POWER]
  },
  {
    title: "Parking distance helper",
    difficulty: "Easy",
    summary: "Mount it on the garage wall: green, yellow, red, then a beep when the car is exactly far enough in.",
    firstStep: "Print distance readings in centimetres and decide your green / yellow / red thresholds.",
    needs: [MCU, ULTRASONIC, LEDS]
  },
  {
    title: "Pan-tilt sensor turret",
    difficulty: "Medium",
    summary: "A servo head that sweeps back and forth and can aim a sensor, laser pointer or camera.",
    firstStep: "Sweep one servo from 0° to 180° with a simple loop and check it isn't straining.",
    needs: [MCU, SERVO]
  },
  {
    title: "Mood lamp with a knob",
    difficulty: "Easy",
    summary: "Addressable LEDs in a jar or 3D-printed shade. Turn the knob to cycle colours and brightness.",
    firstStep: "Run a rainbow example on the LEDs, then map the knob reading to hue.",
    needs: [MCU, ADDRESSABLE, POT]
  },
  {
    title: "Pocket theremin",
    difficulty: "Easy",
    summary: "Wave your hand over a sensor to change the pitch of a buzzer. Instantly annoying, endlessly fun.",
    firstStep: "Map the sensor reading to a frequency and play it with tone().",
    needs: [MCU, BUZZER, LIGHT_SENSOR]
  },
  {
    title: "Drawer or door alarm",
    difficulty: "Easy",
    summary: "A hidden beeper that goes off when a drawer, door or box is opened.",
    firstStep: "Wire the reed or tilt switch like a button and print when it opens and closes.",
    needs: [MCU, REED, BUZZER]
  },
  {
    title: "USB macro pad",
    difficulty: "Medium",
    summary: "A few buttons that type shortcuts, mute your mic or launch apps on your computer.",
    firstStep: "Load a keyboard example so one button types a single letter on your computer.",
    needs: [USB_MCU, BUTTON]
  },
  {
    title: "Hand-held mini fan",
    difficulty: "Easy",
    summary: "A motor, a switch and a battery in a small enclosure. Print or cut a propeller and go.",
    firstStep: "Connect the motor straight to the battery through the switch and check its direction.",
    needs: [DC_MOTOR, POWER, BUTTON]
  },
  {
    title: "Light-seeking desk buddy",
    difficulty: "Medium",
    summary: "A servo-mounted face that slowly turns toward the brightest light in the room.",
    firstStep: "Compare two light-sensor readings and print which side is brighter.",
    needs: [MCU, SERVO, LIGHT_SENSOR]
  },
  {
    title: "Give your salvage a second life",
    difficulty: "Easy",
    summary: "Take the salvaged part apart, keep what still works and rebuild it into a lamp, sculpture or gadget.",
    firstStep: "Photograph it, take it apart and add every useful part you find to your inventory.",
    needs: [SALVAGED, LEDS]
  },
  {
    title: "Tiny status dashboard",
    difficulty: "Medium",
    summary: "A Wi-Fi display that shows the weather, your next calendar event or a countdown.",
    firstStep: "Connect the board to Wi-Fi and print the current time from an NTP server on the display.",
    needs: [WIFI_MCU, DISPLAY]
  }
];
