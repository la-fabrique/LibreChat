import { Schema } from 'mongoose';
import type { IGroup } from '~/types';

const groupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: false,
    },
    email: {
      type: String,
      required: false,
      index: true,
    },
    avatar: {
      type: String,
      required: false,
    },
    memberIds: [
      {
        type: String,
        required: false,
      },
    ],
    source: {
      type: String,
      enum: ['local'],
      default: 'local',
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

groupSchema.index({ memberIds: 1 });

export default groupSchema;
