const API_KEY = 'AIzaSyA1Katq0z6rm5SUQ8URb9B7Hf6PmEDtqvw';

export async function getCoursePhoto(courseName, city) {
  try {
    const query = `${courseName} golf course${city ? ' ' + city : ''}`;
    const searchUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(query)}` +
      `&inputtype=textquery` +
      `&fields=place_id,photos,name` +
      `&key=${API_KEY}`;

    const searchRes  = await fetch(searchUrl);
    const searchData = await searchRes.json();

    const candidate = searchData.candidates?.[0];
    if (!candidate?.photos?.[0]?.photo_reference) return null;

    const ref = candidate.photos[0].photo_reference;
    return (
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=200` +
      `&photo_reference=${ref}` +
      `&key=${API_KEY}`
    );
  } catch (e) {
    return null;
  }
}
