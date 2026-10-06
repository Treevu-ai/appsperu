import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? "4037");

const app = createApp();
app.listen(PORT, () => {
  console.log(`geo-intersections escuchando en http://localhost:${PORT}`);
  console.log(`  GET /api/cruce/punto?lat=&lon=&radio_km=`);
  console.log(`  GET /api/cruce/minero/:codigou`);
  console.log(`  GET /api/cruce/forestal/:capa/:objectid`);
  console.log(`  GET /api/cruce/report`);
  console.log(`  GET /api/cruce/stats`);
  console.log(`  GET /api/communities?capa=&departamento=`);
  console.log(`  GET /api/communities/:objectid`);
  console.log(`  GET /api/communities/intersect?geometry=`);
  console.log(`  GET /api/communities/stats`);
  console.log(`  GET /api/cruce/comunidad/:capa/:objectid`);
  console.log(`  GET /api/cruce/comunidad-minero/report`);
  console.log(`  GET /api/cruce/comunidad-forestal/report`);
  console.log(`  GET /api/cruce/comunidad/stats`);
});
