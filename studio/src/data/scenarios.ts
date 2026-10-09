
import { Car, Briefcase, Coffee, Heart, Baby, Shield, CloudRain, Moon, Music } from 'lucide-react';

export type ScenarioCategory = 'driving' | 'space' | 'service';

export interface ScenarioItem {
    id: string;
    title: string;
    description: string;
    icon: any;
    category: ScenarioCategory;
    subcategory?: string;
    config: {
        scenario: { name: string; weather: string; time: string; road: string };
        car: { windows: string; ac_temp: string; ac_mode: string; lights: string };
        hmi: { message: string; music: string; nav: string };
    };
}

export const SCENARIO_TREE: Record<string, { label: string; icon: any; items: ScenarioItem[] }> = {
    'driving': {
        label: 'Driving Core',
        icon: Car,
        items: [
            {
                id: 'safe_steward',
                title: 'Safety Steward',
                description: 'AI co-pilot monitoring road hazards and driver state.',
                icon: Shield,
                category: 'driving',
                config: {
                    scenario: { name: 'highway', weather: 'clear', time: 'day', road: 'asphalt' },
                    car: { windows: 'close_all', ac_temp: '22C', ac_mode: 'auto', lights: 'day' },
                    hmi: { message: 'Safety Systems Active', music: 'off', nav: 'Route Optimization' }
                }
            },
            {
                id: 'night_vision',
                title: 'Active Night Vision',
                description: 'Enhanced visibility for low-light conditions.',
                icon: Moon,
                category: 'driving',
                config: {
                    scenario: { name: 'night', weather: 'clear', time: 'night', road: 'asphalt' },
                    car: { windows: 'close_all', ac_temp: '24C', ac_mode: 'auto', lights: 'high_beam' },
                    hmi: { message: 'Night Vision Mode On', music: 'off', nav: 'Night Mode Map' }
                }
            },
            {
                id: 'bad_weather',
                title: 'All-Weather Vision',
                description: 'Sensor fusion for rain, snow, and fog.',
                icon: CloudRain,
                category: 'driving',
                config: {
                    scenario: { name: 'rain', weather: 'rain', time: 'day', road: 'asphalt' },
                    car: { windows: 'close_all', ac_temp: '23C', ac_mode: 'defog', lights: 'fog' },
                    hmi: { message: 'Rain Mode Active', music: 'off', nav: 'Weather Alert' }
                }
            }
        ]
    },
    'space': {
        label: 'Third Living Space',
        icon: Coffee,
        items: [
            {
                id: 'meditation',
                title: 'Meditation Pod',
                description: 'Transform cockpit into a zen sanctuary.',
                icon: Heart,
                category: 'space',
                subcategory: 'Health & Relaxation',
                config: {
                    scenario: { name: 'parking', weather: 'clear', time: 'night', road: 'parking' },
                    car: { windows: 'close_all', ac_temp: '25C', ac_mode: 'silent', lights: 'ambient_warm' },
                    hmi: { message: 'Namaste. Breathing exercise starting.', music: 'Meditation.mp3', nav: 'off' }
                }
            },
            {
                id: 'office',
                title: 'Mobile Office',
                description: 'Productivity environment for remote work.',
                icon: Briefcase,
                category: 'space',
                subcategory: 'Productivity',
                config: {
                    scenario: { name: 'parking', weather: 'clear', time: 'day', road: 'parking' },
                    car: { windows: 'open', ac_temp: '22C', ac_mode: 'auto', lights: 'bright_white' },
                    hmi: { message: 'Meeting in 5 mins', music: 'lofi_beats.mp3', nav: 'off' }
                }
            },
            {
                id: 'cinema',
                title: 'Immersive Cinema',
                description: 'Surround sound and dimmed lights for movies.',
                icon: Music,
                category: 'space',
                subcategory: 'Entertainment',
                config: {
                    scenario: { name: 'parking', weather: 'clear', time: 'night', road: 'parking' },
                    car: { windows: 'close_all', ac_temp: '23C', ac_mode: 'auto', lights: 'off' },
                    hmi: { message: 'Playing: Cyberpunk 2077 Movie', music: 'Cinema_Audio_Source', nav: 'off' }
                }
            },
            {
                id: 'pregnancy',
                title: 'Pregnancy Care',
                description: 'Gentle driving profile and air quality monitoring.',
                icon: Baby,
                category: 'space',
                subcategory: 'Family Care',
                config: {
                    scenario: { name: 'urban', weather: 'clear', time: 'day', road: 'asphalt' },
                    car: { windows: 'close_all', ac_temp: '24C', ac_mode: 'gentle', lights: 'soft' },
                    hmi: { message: 'Air Quality: Excellent', music: 'Mozart_for_Babies.mp3', nav: 'Hospital Route' }
                }
            }
        ]
    }
};
