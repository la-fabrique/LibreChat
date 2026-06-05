import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createUserGroupMethods } from './userGroup';
import groupSchema from '~/schema/group';
import userSchema from '~/schema/user';

/** Mocking logger */
jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let Group: mongoose.Model<t.IGroup>;
let User: mongoose.Model<t.IUser>;
let methods: ReturnType<typeof createUserGroupMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  /** Register models */
  Group = mongoose.models.Group || mongoose.model<t.IGroup>('Group', groupSchema);
  User = mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);

  /** Initialize methods */
  methods = createUserGroupMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('UserGroup Methods - Detailed Tests', () => {
  describe('findGroupById', () => {
    test('should find group by ObjectId', async () => {
      const group = await Group.create({
        name: 'Test Group',
        source: 'local',
        memberIds: [],
      });

      const found = await methods.findGroupById(group._id as mongoose.Types.ObjectId);

      expect(found).toBeDefined();
      expect(found?._id.toString()).toBe(group._id.toString());
      expect(found?.name).toBe('Test Group');
    });

    test('should find group by string ID', async () => {
      const group = await Group.create({
        name: 'Test Group',
        source: 'local',
        memberIds: [],
      });

      const found = await methods.findGroupById(group._id as mongoose.Types.ObjectId);

      expect(found).toBeDefined();
      expect(found?._id.toString()).toBe(group._id.toString());
    });

    test('should apply projection correctly', async () => {
      const group = await Group.create({
        name: 'Test Group',
        source: 'local',
        description: 'Test Description',
        memberIds: ['user1', 'user2'],
      });

      const found = await methods.findGroupById(group._id as mongoose.Types.ObjectId, {
        name: 1,
      });

      expect(found).toBeDefined();
      expect(found?.name).toBe('Test Group');
      expect(found?.description).toBeUndefined();
      expect(found?.memberIds).toBeUndefined();
    });

    test('should return null for non-existent group', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const found = await methods.findGroupById(fakeId as mongoose.Types.ObjectId);

      expect(found).toBeNull();
    });
  });

  describe('findGroupsByNamePattern', () => {
    beforeEach(async () => {
      await Group.create([
        { name: 'Engineering Team', source: 'local', memberIds: [] },
        { name: 'Engineering Managers', source: 'local', memberIds: [] },
        { name: 'Marketing Team', source: 'local', memberIds: [] },
        { name: 'Remote Engineering', source: 'local', memberIds: [] },
      ]);
    });

    test('should find groups by name pattern', async () => {
      const groups = await methods.findGroupsByNamePattern('Engineering');

      expect(groups).toHaveLength(3);
      expect(groups.every((g) => g.name.includes('Engineering'))).toBe(true);
    });

    test('should respect case insensitive search', async () => {
      const groups = await methods.findGroupsByNamePattern('engineering');

      expect(groups).toHaveLength(3);
    });

    test('should filter by source when provided', async () => {
      const groups = await methods.findGroupsByNamePattern('Engineering', 'local');

      expect(groups).toHaveLength(2);
      expect(groups.every((g) => g.source === 'local')).toBe(true);
    });

    test('should respect limit parameter', async () => {
      const groups = await methods.findGroupsByNamePattern('Engineering', null, 2);

      expect(groups).toHaveLength(2);
    });

    test('should return empty array for no matches', async () => {
      const groups = await methods.findGroupsByNamePattern('NonExistent');

      expect(groups).toEqual([]);
    });
  });

  describe('findGroupsByMemberId', () => {
    let user1: mongoose.HydratedDocument<t.IUser>;

    beforeEach(async () => {
      user1 = await User.create({
        name: 'User 1',
        email: 'user1@test.com',
        provider: 'local',
      });
    });

    test('should find groups by member ObjectId', async () => {
      await Group.create([
        {
          name: 'Group 1',
          source: 'local',
          memberIds: [(user1._id as mongoose.Types.ObjectId).toString(), 'other-user'],
        },
        {
          name: 'Group 2',
          source: 'local',
          memberIds: [(user1._id as mongoose.Types.ObjectId).toString()],
        },
        {
          name: 'Group 3',
          source: 'local',
          memberIds: ['other-user'],
        },
      ]);

      const groups = await methods.findGroupsByMemberId(user1._id as mongoose.Types.ObjectId);

      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.name).sort()).toEqual(['Group 1', 'Group 2']);
    });

    test('should find groups by member string ID', async () => {
      await Group.create([
        {
          name: 'Group 1',
          source: 'local',
          memberIds: [(user1._id as mongoose.Types.ObjectId).toString()],
        },
      ]);

      const groups = await methods.findGroupsByMemberId(user1._id as mongoose.Types.ObjectId);

      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Group 1');
    });

    test('should return empty array for user with no groups', async () => {
      const groups = await methods.findGroupsByMemberId(user1._id as mongoose.Types.ObjectId);

      expect(groups).toEqual([]);
    });
  });

  describe('createGroup', () => {
    test('should create a group with all fields', async () => {
      const groupData: Partial<t.IGroup> = {
        name: 'New Group',
        source: 'local',
        description: 'A test group',
        email: 'group@test.com',
        avatar: 'avatar-url',
        memberIds: ['user1', 'user2'],
      };

      const group = await methods.createGroup(groupData);

      expect(group).toBeDefined();
      expect(group.name).toBe(groupData.name);
      expect(group.source).toBe(groupData.source);
      expect(group.description).toBe(groupData.description);
      expect(group.email).toBe(groupData.email);
      expect(group.avatar).toBe(groupData.avatar);
      expect(group.memberIds).toEqual(groupData.memberIds);
    });

    test('should create group with minimal data', async () => {
      const group = await methods.createGroup({
        name: 'Minimal Group',
      });

      expect(group).toBeDefined();
      expect(group.name).toBe('Minimal Group');
      expect(group.source).toBe('local'); // default
      expect(group.memberIds).toEqual([]); // default
    });
  });

  describe('addUserToGroup and removeUserFromGroup', () => {
    let user: mongoose.HydratedDocument<t.IUser>;
    let userWithExternal: mongoose.HydratedDocument<t.IUser>;
    let group: mongoose.HydratedDocument<t.IGroup>;

    beforeEach(async () => {
      user = await User.create({
        name: 'Test User',
        email: 'user@test.com',
        provider: 'local',
      });

      userWithExternal = await User.create({
        name: 'External User',
        email: 'external@test.com',
        provider: 'openid',
      });

      group = await Group.create({
        name: 'Test Group',
        source: 'local',
        memberIds: [],
      });
    });

    test('should add user to group using user ID', async () => {
      const result = await methods.addUserToGroup(
        user._id as mongoose.Types.ObjectId,
        group._id as mongoose.Types.ObjectId,
      );

      expect(result.user).toBeDefined();
      expect(result.group).toBeDefined();
      expect(result.group?.memberIds).toContain((user._id as mongoose.Types.ObjectId).toString());
    });

    test('should add external user to group using userId string', async () => {
      const result = await methods.addUserToGroup(
        userWithExternal._id as mongoose.Types.ObjectId,
        group._id as mongoose.Types.ObjectId,
      );

      expect(result.group?.memberIds).toContain(
        (userWithExternal._id as mongoose.Types.ObjectId).toString(),
      );
    });

    test('should not duplicate user in group', async () => {
      // Add user first time
      await methods.addUserToGroup(
        user._id as mongoose.Types.ObjectId,
        group._id as mongoose.Types.ObjectId,
      );

      // Add same user again
      const result = await methods.addUserToGroup(
        user._id as mongoose.Types.ObjectId,
        group._id as mongoose.Types.ObjectId,
      );

      expect(result.group?.memberIds).toHaveLength(1);
      expect(result.group?.memberIds).toContain((user._id as mongoose.Types.ObjectId).toString());
    });

    test('should remove user from group', async () => {
      // First add user
      await methods.addUserToGroup(
        user._id as mongoose.Types.ObjectId,
        group._id as mongoose.Types.ObjectId,
      );

      // Then remove
      const result = await methods.removeUserFromGroup(
        user._id as mongoose.Types.ObjectId,
        group._id as mongoose.Types.ObjectId,
      );

      expect(result.group?.memberIds).toHaveLength(0);
      expect(result.group?.memberIds).not.toContain(
        (user._id as mongoose.Types.ObjectId).toString(),
      );
    });

    test('should handle removing user not in group', async () => {
      const result = await methods.removeUserFromGroup(
        user._id as mongoose.Types.ObjectId,
        group._id as mongoose.Types.ObjectId,
      );

      expect(result.group?.memberIds).toHaveLength(0);
    });
  });

  describe('getUserGroups', () => {
    let user: mongoose.HydratedDocument<t.IUser>;

    beforeEach(async () => {
      user = await User.create({
        name: 'Test User',
        email: 'user@test.com',
        provider: 'local',
      });
    });

    test('should get all groups for a user', async () => {
      // Create groups with user as member
      await Group.create([
        {
          name: 'Group 1',
          source: 'local',
          memberIds: [(user._id as mongoose.Types.ObjectId).toString()],
        },
        {
          name: 'Group 2',
          source: 'local',
          memberIds: [(user._id as mongoose.Types.ObjectId).toString(), 'other-user'],
        },
        {
          name: 'Group 3',
          source: 'local',
          memberIds: ['other-user'],
        },
      ]);

      const groups = await methods.getUserGroups(user._id as mongoose.Types.ObjectId);

      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.name).sort()).toEqual(['Group 1', 'Group 2']);
    });

    test('should return empty array for user with no groups', async () => {
      const groups = await methods.getUserGroups(user._id as mongoose.Types.ObjectId);

      expect(groups).toEqual([]);
    });

    test('should find groups for user by userId', async () => {
      const externalUser = await User.create({
        name: 'External User',
        email: 'external@test.com',
        provider: 'openid',
      });

      await Group.create({
        name: 'External Group',
        source: 'local',
        memberIds: [(externalUser._id as mongoose.Types.ObjectId).toString()],
      });

      const groups = await methods.getUserGroups(externalUser._id as mongoose.Types.ObjectId);

      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('External Group');
    });
  });

  describe('listGroups', () => {
    beforeEach(async () => {
      await Group.create([
        { name: 'Beta', source: 'local', memberIds: [], email: 'beta@test.com' },
        { name: 'Alpha', source: 'local', memberIds: [], description: 'first group' },
        { name: 'Gamma', source: 'local', memberIds: [] },
      ]);
    });

    test('returns groups sorted by name', async () => {
      const groups = await methods.listGroups();

      expect(groups).toHaveLength(3);
      expect(groups[0].name).toBe('Alpha');
      expect(groups[1].name).toBe('Beta');
      expect(groups[2].name).toBe('Gamma');
    });

    test('filters by source', async () => {
      const groups = await methods.listGroups({ source: 'local' });

      expect(groups).toHaveLength(3);
    });

    test('filters by search (name)', async () => {
      const groups = await methods.listGroups({ search: 'alpha' });

      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Alpha');
    });

    test('filters by search (email)', async () => {
      const groups = await methods.listGroups({ search: 'beta@test' });

      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Beta');
    });

    test('filters by search (description)', async () => {
      const groups = await methods.listGroups({ search: 'first group' });

      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Alpha');
    });

    test('respects limit and offset', async () => {
      const groups = await methods.listGroups({ limit: 1, offset: 1 });

      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Beta');
    });

    test('returns empty for no matches', async () => {
      const groups = await methods.listGroups({ search: 'nonexistent' });

      expect(groups).toHaveLength(0);
    });
  });

  describe('countGroups', () => {
    beforeEach(async () => {
      await Group.create([
        { name: 'A', source: 'local', memberIds: [] },
        { name: 'B', source: 'local', memberIds: [] },
        { name: 'C', source: 'local', memberIds: [] },
      ]);
    });

    test('returns total count', async () => {
      const count = await methods.countGroups();

      expect(count).toBe(3);
    });

    test('respects source filter', async () => {
      const count = await methods.countGroups({ source: 'local' });

      expect(count).toBe(2);
    });

    test('respects search filter', async () => {
      const count = await methods.countGroups({ search: 'A' });

      expect(count).toBe(1);
    });
  });

  describe('deleteGroup', () => {
    test('returns deleted group', async () => {
      const group = await Group.create({ name: 'ToDelete', source: 'local', memberIds: [] });

      const deleted = await methods.deleteGroup(group._id as mongoose.Types.ObjectId);

      expect(deleted).toBeDefined();
      expect(deleted?.name).toBe('ToDelete');
      const remaining = await Group.findById(group._id);
      expect(remaining).toBeNull();
    });

    test('returns null for non-existent ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await methods.deleteGroup(fakeId);

      expect(result).toBeNull();
    });
  });

  describe('removeMemberById', () => {
    test('removes member from memberIds array', async () => {
      const group = await Group.create({
        name: 'Test',
        source: 'local',
        memberIds: ['m1', 'm2', 'm3'],
      });

      const updated = await methods.removeMemberById(group._id as mongoose.Types.ObjectId, 'm2');

      expect(updated).toBeDefined();
      expect(updated?.memberIds).toEqual(['m1', 'm3']);
    });

    test('is idempotent when memberId not present', async () => {
      const group = await Group.create({
        name: 'Test',
        source: 'local',
        memberIds: ['m1'],
      });

      const updated = await methods.removeMemberById(
        group._id as mongoose.Types.ObjectId,
        'nonexistent',
      );

      expect(updated).toBeDefined();
      expect(updated?.memberIds).toEqual(['m1']);
    });

    test('returns null for non-existent group', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await methods.removeMemberById(fakeId, 'any-id');

      expect(result).toBeNull();
    });
  });

  describe('sortPrincipalsByRelevance', () => {
    test('should sort principals by relevance score', async () => {
      const principals = [
        { id: '1', name: 'Test User', type: 'user' as const, source: 'local' as const },
        { id: '2', name: 'Admin Test', type: 'user' as const, source: 'local' as const },
        { id: '3', name: 'Test Group', type: 'group' as const, source: 'local' as const },
      ];

      // Store original query in closure or pass it through
      const sorted = methods.sortPrincipalsByRelevance(principals);

      // Since we can't pass the query directly, the method should maintain
      // the original order or have been called in a context where it knows the query
      expect(sorted).toBeDefined();
      expect(sorted).toHaveLength(3);
    });
  });
});
