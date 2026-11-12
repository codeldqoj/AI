import { contentAllowed, scopeFilter } from './education-access.js';

const fields = {
  exams: 'category', problems: 'sourceGroup', content_sets: 'group', content_blocks: 'group',
  submissions: 'sourceGroup', documents: 'sourceGroup', exam_trend_reports: 'sourceGroup', trend_theories: 'sourceGroup'
};
const denied = () => Object.assign(new Error('Nội dung không thuộc cấp học được cấp quyền'), { code: 'EDUCATION_ACCESS_DENIED' });

// Keep all database reads, counts, aggregations and writes in the same content scope.
// Admin uses the original handle. No connection or pool configuration is changed.
export function educationDb(db, session) {
  if (session?.role === 'admin') return db;
  // Existing accounts retain the full legacy catalog without changing its queries.
  if (!Object.hasOwn(session || {}, 'educationLevels')) return db;
  return new Proxy(db, { get(target, prop) {
    if (prop !== 'collection') return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
    return name => {
      const collection = target.collection(name), field = fields[name];
      if (!field) return collection;
      const scope = query => scopeFilter(query || {}, session, field);
      const validate = doc => { if (!contentAllowed(session, doc)) throw denied(); };
      return new Proxy(collection, { get(col, method) {
        if (['find', 'findOne', 'countDocuments', 'deleteOne', 'deleteMany', 'findOneAndDelete'].includes(method)) {
          return (query, ...args) => col[method](scope(query), ...args);
        }
        if (method === 'aggregate') return (pipeline, ...args) => {
          // Search stages must remain first and need an explicit scope; none of these catalogs uses them.
          if (pipeline.some(stage => ['$search', '$vectorSearch', '$geoNear', '$lookup', '$unionWith', '$out', '$merge'].some(key => key in stage))) throw denied();
          return col.aggregate([{ $match: scope({}) }, ...pipeline], ...args);
        };
        if (['updateOne', 'updateMany', 'findOneAndUpdate'].includes(method)) return (query, update, options) => {
          if (Array.isArray(update)) throw denied();
          if (Object.hasOwn(update.$set || {}, field) || Object.hasOwn(update.$set || {}, 'educationLevel')) validate(update.$set);
          if (Object.hasOwn(update.$unset || {}, field) || Object.hasOwn(update.$unset || {}, 'educationLevel') || update.$rename) throw denied();
          if (options?.upsert) validate({ ...query, ...update.$setOnInsert, ...update.$set });
          return col[method](scope(query), update, options);
        };
        if (method === 'insertOne') return (doc, ...args) => { validate(doc); return col.insertOne(doc, ...args); };
        if (method === 'insertMany') return (docs, ...args) => { docs.forEach(validate); return col.insertMany(docs, ...args); };
        if (['bulkWrite', 'replaceOne', 'findOneAndReplace', 'distinct', 'estimatedDocumentCount', 'watch'].includes(method)) return () => { throw denied(); };
        return typeof col[method] === 'function' ? col[method].bind(col) : col[method];
      } });
    };
  } });
}
