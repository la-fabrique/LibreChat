import { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import type { TUser, TPrincipalSearchResult } from 'librechat-data-provider';
import type { Model, ClientSession, FilterQuery } from 'mongoose';
import type { IGroup, IRole, IUser } from '~/types';
import { escapeRegExp } from '~/utils/string';

export function createUserGroupMethods(mongoose: typeof import('mongoose')) {
  /**
   * Find a group by its ID
   */
  async function findGroupById(
    groupId: string | Types.ObjectId,
    projection: Record<string, 0 | 1> = {},
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const query = Group.findOne({ _id: groupId }, projection);
    if (session) {
      query.session(session);
    }
    return await query.lean<IGroup>();
  }

  /**
   * Find groups by name pattern (case-insensitive partial match)
   */
  async function findGroupsByNamePattern(
    namePattern: string,
    source: 'local' | null = null,
    limit: number = 20,
    session?: ClientSession,
  ): Promise<IGroup[]> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const regex = new RegExp(escapeRegExp(namePattern), 'i');
    const query: Record<string, unknown> = {
      $or: [{ name: regex }, { email: regex }, { description: regex }],
    };

    if (source) {
      query.source = source;
    }

    const dbQuery = Group.find(query).limit(limit);
    if (session) {
      dbQuery.session(session);
    }
    return await dbQuery.lean<IGroup[]>();
  }

  /**
   * Find all groups a user is a member of by their MongoDB user ID
   */
  async function findGroupsByMemberId(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IGroup[]> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const memberId = userId.toString();
    const query = Group.find({ memberIds: memberId });
    if (session) {
      query.session(session);
    }
    return await query.lean<IGroup[]>();
  }

  /**
   * Create a new group
   */
  async function createGroup(groupData: Partial<IGroup>, session?: ClientSession): Promise<IGroup> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const options = session ? { session } : {};
    return await Group.create([groupData], options).then((groups) => groups[0]);
  }

  /**
   * Add a user to a group
   */
  async function addUserToGroup(
    userId: string | Types.ObjectId,
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ user: IUser; group: IGroup | null }> {
    const User = mongoose.models.User as Model<IUser>;
    const Group = mongoose.models.Group as Model<IGroup>;

    const options = { new: true, ...(session ? { session } : {}) };

    const user = await User.findById(userId, '_id', options).lean<{ _id: Types.ObjectId }>();
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const memberId = userId.toString();
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $addToSet: { memberIds: memberId } },
      options,
    ).lean<IGroup>();

    return { user: user as IUser, group: updatedGroup };
  }

  /**
   * Remove a user from a group
   */
  async function removeUserFromGroup(
    userId: string | Types.ObjectId,
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ user: IUser; group: IGroup | null }> {
    const User = mongoose.models.User as Model<IUser>;
    const Group = mongoose.models.Group as Model<IGroup>;

    const options = { new: true, ...(session ? { session } : {}) };

    const user = await User.findById(userId, '_id', options).lean<{ _id: Types.ObjectId }>();
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const memberId = userId.toString();
    const updatedGroup = await Group.findByIdAndUpdate(
      groupId,
      { $pullAll: { memberIds: [memberId] } },
      options,
    ).lean<IGroup>();

    return { user: user as IUser, group: updatedGroup };
  }

  /**
   * Get all groups a user is a member of
   */
  async function getUserGroups(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IGroup[]> {
    return await findGroupsByMemberId(userId, session);
  }

  /**
   * Get a list of all principal identifiers for a user (user ID + group IDs + public).
   * For use in permission checks.
   */
  async function getUserPrincipals(
    params: {
      userId: string | Types.ObjectId;
      role?: string | null;
    },
    session?: ClientSession,
  ): Promise<Array<{ principalType: PrincipalType; principalId?: string | Types.ObjectId }>> {
    const { userId, role } = params;
    const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const principals: Array<{
      principalType: PrincipalType;
      principalId?: string | Types.ObjectId;
    }> = [{ principalType: PrincipalType.USER, principalId: userObjectId }];

    let userRole = role;
    if (userRole === undefined) {
      const User = mongoose.models.User as Model<IUser>;
      const query = User.findById(userId).select('role');
      if (session) {
        query.session(session);
      }
      const user = await query.lean<IUser>();
      userRole = user?.role;
    }

    if (userRole && userRole.trim()) {
      principals.push({ principalType: PrincipalType.ROLE, principalId: userRole });
    }

    const userGroups = await getUserGroups(userId, session);
    if (userGroups && userGroups.length > 0) {
      userGroups.forEach((group) => {
        principals.push({ principalType: PrincipalType.GROUP, principalId: group._id });
      });
    }

    principals.push({ principalType: PrincipalType.PUBLIC });

    return principals;
  }

  /**
   * Calculate relevance score for a search result
   */
  function calculateRelevanceScore(item: TPrincipalSearchResult, searchPattern: string): number {
    const normalizedPattern = searchPattern.toLowerCase();

    const searchableFields =
      item.type === PrincipalType.USER
        ? [item.name, item.email, item.username].filter(Boolean)
        : [item.name, item.email, item.description].filter(Boolean);

    let maxScore = 0;

    for (const field of searchableFields) {
      if (!field) continue;
      const fieldLower = field.toLowerCase();
      let score = 0;

      if (fieldLower === normalizedPattern) {
        score = 100;
      } else if (fieldLower.startsWith(normalizedPattern)) {
        score = 80;
      } else if (fieldLower.includes(normalizedPattern)) {
        score = 50;
      } else {
        score = 10;
      }

      maxScore = Math.max(maxScore, score);
    }

    return maxScore;
  }

  /**
   * Sort principals by relevance score and type priority
   */
  function sortPrincipalsByRelevance<
    T extends { _searchScore?: number; type: string; name?: string; email?: string },
  >(results: T[]): T[] {
    return results.sort((a, b) => {
      if (b._searchScore !== a._searchScore) {
        return (b._searchScore || 0) - (a._searchScore || 0);
      }
      if (a.type !== b.type) {
        return a.type === PrincipalType.USER ? -1 : 1;
      }
      const aName = a.name || a.email || '';
      const bName = b.name || b.email || '';
      return aName.localeCompare(bName);
    });
  }

  /**
   * Transform user object to TPrincipalSearchResult format
   */
  function transformUserToTPrincipalSearchResult(user: TUser): TPrincipalSearchResult {
    return {
      id: user.id,
      type: PrincipalType.USER,
      name: user.name || user.email,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      provider: user.provider,
      source: 'local',
    };
  }

  /**
   * Transform group object to TPrincipalSearchResult format
   */
  function transformGroupToTPrincipalSearchResult(group: IGroup): TPrincipalSearchResult {
    return {
      id: group._id?.toString(),
      type: PrincipalType.GROUP,
      name: group.name,
      email: group.email,
      avatar: group.avatar,
      description: group.description,
      source: 'local',
      memberCount: group.memberIds ? group.memberIds.length : 0,
    };
  }

  /**
   * Search for principals (users and groups) by pattern matching on name/email
   */
  async function searchPrincipals(
    searchPattern: string,
    limitPerType: number = 10,
    typeFilter: Array<PrincipalType.USER | PrincipalType.GROUP | PrincipalType.ROLE> | null = null,
    session?: ClientSession,
  ): Promise<TPrincipalSearchResult[]> {
    if (!searchPattern || searchPattern.trim().length === 0) {
      return [];
    }

    const trimmedPattern = searchPattern.trim();
    const escapedPattern = escapeRegExp(trimmedPattern);
    const promises: Promise<TPrincipalSearchResult[]>[] = [];

    if (!typeFilter || typeFilter.includes(PrincipalType.USER)) {
      const userFields = 'name email username avatar provider';
      const User = mongoose.models.User as Model<IUser>;
      const regex = new RegExp(escapedPattern, 'i');
      const userQuery = User.find({
        $or: [{ name: regex }, { email: regex }, { username: regex }],
      })
        .select(userFields)
        .limit(limitPerType);

      if (session) {
        userQuery.session(session);
      }

      promises.push(
        userQuery.lean<IUser[]>().then((users) =>
          users.map((user) =>
            transformUserToTPrincipalSearchResult({
              id: user._id?.toString() || '',
              name: user.name,
              email: user.email,
              username: user.username,
              avatar: user.avatar,
              provider: user.provider,
            } as TUser),
          ),
        ),
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    if (!typeFilter || typeFilter.includes(PrincipalType.GROUP)) {
      promises.push(
        findGroupsByNamePattern(trimmedPattern, null, limitPerType, session).then((groups) =>
          groups.map(transformGroupToTPrincipalSearchResult),
        ),
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    if (!typeFilter || typeFilter.includes(PrincipalType.ROLE)) {
      const Role = mongoose.models.Role as Model<IRole>;
      if (Role) {
        const regex = new RegExp(escapedPattern, 'i');
        const roleQuery = Role.find({ name: regex }).select('name').limit(limitPerType);

        if (session) {
          roleQuery.session(session);
        }

        promises.push(
          roleQuery.lean<Array<{ name: string }>>().then((roles) =>
            roles.map((role) => ({
              id: role.name,
              type: PrincipalType.ROLE,
              name: role.name,
              source: 'local' as const,
            })),
          ),
        );
      }
    } else {
      promises.push(Promise.resolve([]));
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  /**
   * Removes a user from all groups they belong to.
   */
  async function removeUserFromAllGroups(userId: string | Types.ObjectId): Promise<void> {
    const Group = mongoose.models.Group as Model<IGroup>;
    await Group.updateMany({ memberIds: userId }, { $pullAll: { memberIds: [userId] } });
  }

  /**
   * Finds a single group matching the given filter.
   */
  async function findGroupByQuery(
    filter: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const query = Group.findOne(filter);
    if (session) {
      query.session(session);
    }
    return query.lean<IGroup>();
  }

  /**
   * Updates a group by its ID.
   */
  async function updateGroupById(
    groupId: string | Types.ObjectId,
    data: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const options = { new: true, ...(session ? { session } : {}) };
    return Group.findByIdAndUpdate(groupId, { $set: data }, options).lean<IGroup>();
  }

  /**
   * Bulk-updates groups matching a filter.
   */
  async function bulkUpdateGroups(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: { session?: ClientSession },
  ) {
    const Group = mongoose.models.Group as Model<IGroup>;
    return Group.updateMany(filter, update, options || {});
  }

  function buildGroupQuery(filter: { source?: 'local'; search?: string }): FilterQuery<IGroup> {
    const query: FilterQuery<IGroup> = {};
    if (filter.source) {
      query.source = filter.source;
    }
    if (filter.search) {
      const regex = new RegExp(escapeRegExp(filter.search), 'i');
      query.$or = [{ name: regex }, { email: regex }, { description: regex }];
    }
    return query;
  }

  /**
   * List groups with optional source, search, and pagination filters.
   */
  async function listGroups(
    filter: {
      source?: 'local';
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
    session?: ClientSession,
  ): Promise<IGroup[]> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const query = buildGroupQuery(filter);
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    return await Group.find(query)
      .sort({ name: 1 })
      .skip(offset)
      .limit(limit)
      .session(session ?? null)
      .lean<IGroup[]>();
  }

  /**
   * Count groups matching optional source and search filters.
   */
  async function countGroups(
    filter: { source?: 'local'; search?: string } = {},
    session?: ClientSession,
  ): Promise<number> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const query = buildGroupQuery(filter);
    return await Group.countDocuments(query).session(session ?? null);
  }

  /**
   * Delete a group by its ID.
   */
  async function deleteGroup(
    groupId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const options = session ? { session } : {};
    return await Group.findByIdAndDelete(groupId, options).lean<IGroup>();
  }

  /**
   * Remove a member from a group by raw memberId string.
   */
  async function removeMemberById(
    groupId: string | Types.ObjectId,
    memberId: string,
    session?: ClientSession,
  ): Promise<IGroup | null> {
    const Group = mongoose.models.Group as Model<IGroup>;
    const options = { new: true, ...(session ? { session } : {}) };
    return await Group.findByIdAndUpdate(
      groupId,
      { $pull: { memberIds: memberId } },
      options,
    ).lean<IGroup>();
  }

  return {
    findGroupById,
    findGroupsByNamePattern,
    findGroupsByMemberId,
    createGroup,
    addUserToGroup,
    removeUserFromGroup,
    removeUserFromAllGroups,
    findGroupByQuery,
    updateGroupById,
    bulkUpdateGroups,
    getUserGroups,
    getUserPrincipals,
    searchPrincipals,
    calculateRelevanceScore,
    sortPrincipalsByRelevance,
    listGroups,
    countGroups,
    deleteGroup,
    removeMemberById,
  };
}

export type UserGroupMethods = ReturnType<typeof createUserGroupMethods>;
