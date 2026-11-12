/**
 * Sitecore Authoring & Management GraphQL operations.
 * Every operation is named: the mock host (src/lib/marketplace/mock.ts) routes on these names,
 * and named operations are easier to find in Sitecore logs.
 */

const REDIRECT_FIELDS = /* GraphQL */ `
  itemId
  name
  path
  hasChildren
  template { templateId name }
  urlMapping: field(name: "UrlMapping") { value }
  redirectType: field(name: "RedirectType") { value }
  preserveQs: field(name: "PreserveQueryString") { value }
  publishFrom: field(name: "__Publish") { value }
  publishTo: field(name: "__Unpublish") { value }
`;

export const GET_REDIRECT_FOLDER = /* GraphQL */ `
  query GetRedirectFolder($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
      itemId
      path
      children(first: 200) {
        nodes {
          ${REDIRECT_FIELDS}
          children(first: 200) { nodes { ${REDIRECT_FIELDS} } }
        }
      }
    }
  }
`;

export const GET_ITEM_ID_BY_PATH = /* GraphQL */ `
  query GetItemIdByPath($path: String!) {
    item(where: { path: $path }) {
      itemId
      path
    }
  }
`;

export const GET_SIBLING_NAMES = /* GraphQL */ `
  query GetSiblingNames($id: ID!) {
    item(where: { itemId: $id }) {
      itemId
      children(first: 500) { nodes { itemId name } }
    }
  }
`;

export const FIND_REFERRERS = /* GraphQL */ `
  query FindReferrers($field: String!, $value: String!, $pageSize: Int!) {
    search(
      query: {
        searchStatement: { criteria: [{ field: $field, value: $value, criteriaType: EXACT, operator: MUST }] }
        paging: { pageSize: $pageSize, pageIndex: 0 }
      }
    ) {
      totalCount
      results {
        itemId
        name
        path
        language { name }
      }
    }
  }
`;

export const CREATE_ITEM = /* GraphQL */ `
  mutation CreateItem($name: String!, $templateId: ID!, $parent: ID!, $language: String!, $fields: [FieldValueInput]) {
    createItem(input: { name: $name, templateId: $templateId, parent: $parent, language: $language, fields: $fields }) {
      item { itemId name path }
    }
  }
`;

export const UPDATE_ITEM_FIELDS = /* GraphQL */ `
  mutation UpdateItemFields($id: ID!, $language: String!, $fields: [FieldValueInput]!) {
    updateItem(input: { itemId: $id, language: $language, fields: $fields }) {
      item { itemId }
    }
  }
`;

export const MOVE_ITEM = /* GraphQL */ `
  mutation MoveItem($id: ID!, $targetParentId: ID!) {
    moveItem(input: { itemId: $id, targetParentId: $targetParentId }) {
      item { itemId path }
    }
  }
`;

export const RENAME_ITEM = /* GraphQL */ `
  mutation RenameItem($id: ID!, $newName: String!) {
    renameItem(input: { itemId: $id, newName: $newName }) {
      item { itemId name path }
    }
  }
`;

export const DELETE_ITEM = /* GraphQL */ `
  mutation DeleteItem($id: ID!, $permanently: Boolean!) {
    deleteItem(input: { itemId: $id, permanently: $permanently }) {
      successful
    }
  }
`;

export const PUBLISH_ITEM = /* GraphQL */ `
  mutation PublishItem($id: ID!, $languages: [String]!, $targets: [String]!, $subItems: Boolean!, $related: Boolean!) {
    publishItem(
      input: {
        rootItemId: $id
        languages: $languages
        targetDatabases: $targets
        publishItemMode: SMART
        publishRelatedItems: $related
        publishSubItems: $subItems
      }
    ) {
      operationId
    }
  }
`;

export function opName(query: string): string {
  return /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "Anonymous";
}

/** One version of a page: its own content fields plus the layout (for datasource references). */
export const PAGE_FIELDS = /* GraphQL */ `
  query PageFields($id: ID!, $language: String!, $version: Int) {
    item(where: { itemId: $id, language: $language, version: $version }) {
      itemId
      version
      fields(ownFields: false, excludeStandardFields: true) {
        nodes { name value }
      }
      layout: field(name: "__Final Renderings") { value }
      neverPublish: field(name: "__Never publish") { value }
      publishFrom: field(name: "__Publish") { value }
      publishTo: field(name: "__Unpublish") { value }
    }
  }
`;

export const UPDATE_VERSION_FIELDS = /* GraphQL */ `
  mutation UpdateVersionFields($id: ID!, $language: String!, $version: Int, $fields: [FieldValueInput]!) {
    updateItem(input: { itemId: $id, language: $language, version: $version, fields: $fields }) {
      item { itemId }
    }
  }
`;

export const GET_CHILDREN = /* GraphQL */ `
  query GetChildren($path: String, $id: ID) {
    item(where: { path: $path, itemId: $id }) {
      itemId
      path
      children(first: 500) {
        nodes {
          itemId
          name
          path
          template { templateId name }
          displayName: field(name: "__Display name") { value }
          note: field(name: "__Long description") { value }
          updated: field(name: "__Updated") { value }
        }
      }
    }
  }
`;

export const COPY_ITEM = /* GraphQL */ `
  mutation CopyItem($id: ID!, $targetParentId: ID!, $name: String!) {
    copyItem(input: { itemId: $id, targetParentId: $targetParentId, copyItemName: $name, deepCopy: true }) {
      item { itemId name path }
    }
  }
`;
