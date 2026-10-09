/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
        fontFamily: {
          sans: ['var(--font-studio)'],
          mono: ['var(--font-code)'],
        },
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
            blue: {"50": "#ebf5ff", "100": "#d4eaff", "200": "#b1d8ff", "300": "#8fc7ff", "400": "#7ba9d7", "500": "#5e7e9f", "600": "#516a84", "700": "#46596d", "800": "#394755", "900": "#2e363e", "950": "#25282c"},
            cyan: {"50": "#eefbfa", "100": "#dbf6f5", "200": "#bdefed", "300": "#a1e8e5", "400": "#89c4c1", "500": "#699190", "600": "#597978", "700": "#4c6564", "800": "#3d4e4f", "900": "#303a3b", "950": "#262a2b"},
            green: {"50": "#eff9f0", "100": "#dcf3e0", "200": "#bfe9c6", "300": "#a4dfae", "400": "#8cbc94", "500": "#6a8c71", "600": "#5a755f", "700": "#4d6251", "800": "#3e4c41", "900": "#313933", "950": "#262a28"},
            emerald: {"50": "#eff9f0", "100": "#dcf3e0", "200": "#bfe9c6", "300": "#a4dfae", "400": "#8cbc94", "500": "#6a8c71", "600": "#5a755f", "700": "#4d6251", "800": "#3e4c41", "900": "#313933", "950": "#262a28"},
            purple: {"50": "#f7f6ff", "100": "#eeecff", "200": "#e0dbff", "300": "#d2ccff", "400": "#b2add7", "500": "#85819f", "600": "#6f6c84", "700": "#5d5b6d", "800": "#494855", "900": "#37363e", "950": "#29282c"},
            violet: {"50": "#f7f6ff", "100": "#eeecff", "200": "#e0dbff", "300": "#d2ccff", "400": "#b2add7", "500": "#85819f", "600": "#6f6c84", "700": "#5d5b6d", "800": "#494855", "900": "#37363e", "950": "#29282c"},
            indigo: {"50": "#f2f5ff", "100": "#e3e9ff", "200": "#ccd6ff", "300": "#b6c5ff", "400": "#9ba7d7", "500": "#757d9f", "600": "#626984", "700": "#53586d", "800": "#424655", "900": "#33353e", "950": "#27282c"},
            pink: {"50": "#fcf2f7", "100": "#f8e4ef", "200": "#f2cde2", "300": "#edb7d5", "400": "#c89bb4", "500": "#947587", "600": "#7b6371", "700": "#66545f", "800": "#50434b", "900": "#3b3338", "950": "#2a272a"},
            red: {"50": "#fcf0f0", "100": "#f8dfdf", "200": "#f2c4c4", "300": "#edabab", "400": "#c89292", "500": "#946e6f", "600": "#7b5d5e", "700": "#664f50", "800": "#504041", "900": "#3b3233", "950": "#2a2627"},
            orange: {"50": "#fcf4ef", "100": "#f9e7de", "200": "#f4d3c2", "300": "#f0c0a8", "400": "#caa38f", "500": "#967a6d", "600": "#7c675d", "700": "#68574f", "800": "#504540", "900": "#3b3532", "950": "#2b2827"},
            amber: {"50": "#fcf6ee", "100": "#f9eddb", "200": "#f3ddbc", "300": "#eecfa0", "400": "#c9af89", "500": "#958369", "600": "#7c6e59", "700": "#675c4c", "800": "#50483e", "900": "#3b3731", "950": "#2a2927"},
            yellow: {"50": "#fcf6ee", "100": "#f9eddb", "200": "#f3ddbc", "300": "#eecfa0", "400": "#c9af89", "500": "#958369", "600": "#7c6e59", "700": "#675c4c", "800": "#50483e", "900": "#3b3731", "950": "#2a2927"},
            teal: {"50": "#eefbfa", "100": "#dbf6f5", "200": "#bdefed", "300": "#a1e8e5", "400": "#89c4c1", "500": "#699190", "600": "#597978", "700": "#4c6564", "800": "#3d4e4f", "900": "#303a3b", "950": "#262a2b"},

  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [],
}
