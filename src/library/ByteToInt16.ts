export default (_byte, _offset) => {
  return (_byte[_offset] & 255) + ((_byte[_offset + 1] & 255) << 8);
};
