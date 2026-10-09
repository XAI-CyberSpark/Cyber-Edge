import descriptor from '../../public/models/su7/rig.json';
import { readCarRig } from '../domain/carRig';

export const activeCarRig = readCarRig(descriptor);
